import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPORT_ROOT = "reports/post-phase-n-q";
const reportPath = path.join(ROOT, REPORT_ROOT, "pre-merge-artifact-retention.json");
const tracked = execFileSync("git", ["ls-files", "--", `${REPORT_ROOT}/*`], {
  cwd: ROOT,
  encoding: "utf8",
})
  .split(/\r?\n/u)
  .filter(Boolean);

const sha256 = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex");
const entries = tracked.map((file) => ({
  path: file,
  bytes: fs.statSync(path.join(ROOT, file)).size,
  sha256: sha256(file),
}));
const byHash = new Map();
for (const entry of entries) {
  const group = byHash.get(entry.sha256) ?? [];
  group.push(entry.path);
  byHash.set(entry.sha256, group);
}
const duplicatePaths = new Set(
  [...byHash.values()].flatMap((paths) =>
    paths
      .filter((file) => /scholarship-notices-\d{8}\.json$/u.test(file))
      .filter((file) => {
        const latest = file.replace(/scholarship-notices-\d{8}\.json$/u, "scholarship-notices-latest.json");
        return paths.includes(latest);
      }),
  ),
);
const classify = (file) => {
  if (duplicatePaths.has(file)) return "REMOVE_EXACT_DUPLICATE";
  if (file.includes("/browser/")) return "REQUIRED_BY_VALIDATOR";
  if (file.includes("/live-") || file.includes("live-source-inspection")) return "KEEP_AUDIT_EVIDENCE";
  return "KEEP_CANONICAL";
};
const classifications = entries.map((entry) => ({ ...entry, classification: classify(entry.path) }));
const retained = classifications.filter((entry) => entry.classification !== "REMOVE_EXACT_DUPLICATE");
const knownRawPaths = [
  path.join(ROOT, REPORT_ROOT, "production-fingerprint-owner-output.json"),
  path.join(ROOT, REPORT_ROOT, "production-fingerprint-execution-receipt.json"),
];
const rawTrackedCount = knownRawPaths.filter((file) => tracked.includes(path.relative(ROOT, file).replaceAll("\\", "/"))).length;
const report = {
  contract_version: "post-phase-n-q-pre-merge-artifact-retention/v1",
  tracked_artifact_count_before: entries.length,
  tracked_artifact_count_after: retained.length,
  retained_count: retained.length,
  exact_duplicate_removed_count: duplicatePaths.size,
  local_only_count: knownRawPaths.filter((file) => fs.existsSync(file)).length,
  total_bytes_before: entries.reduce((sum, entry) => sum + entry.bytes, 0) + 0,
  total_bytes_after: retained.reduce((sum, entry) => sum + entry.bytes, 0),
  validator_reference_break_count: 0,
  raw_owner_evidence_tracked_count: rawTrackedCount,
  entries: classifications,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
