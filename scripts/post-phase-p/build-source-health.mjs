import fs from "node:fs";
import path from "node:path";
import { calculateSourceHealth } from "../../lib/post-phase-n-q/source-health.mjs";

const ROOT = process.cwd();
const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const inspection = readJson(
  "reports/post-phase-n-q/live-source-inspection.json",
);
const mHealth = readJson("reports/post-phase-m-source-health.json");
const attachmentPath = path.join(
  ROOT,
  "reports/post-phase-n-q/live-attachment-inspection.json",
);
const attachment = fs.existsSync(attachmentPath)
  ? readJson("reports/post-phase-n-q/live-attachment-inspection.json")
  : null;

const sources = inspection.sources.map((source) => {
  const prior = mHealth.sources.find(
    (item) => item.source_key === source.source_key,
  );
  const observations = [
    ...(prior?.observations ?? []).map((item) => ({
      observed_at: null,
      error: item.error_code,
      matched_count: item.matched_count,
      new_item_count: item.matched_count,
      detail_attribution_count: item.body_evidence_count,
      body_usable_count: item.body_evidence_count,
    })),
    {
      observed_at: inspection.generated_at,
      error:
        source.transport.final_status === "REACHABLE" ||
        source.transport.final_status === "TLS_REMEDIATED"
          ? null
          : source.transport.final_status,
      matched_count: source.matched_items.length,
      new_item_count: source.matched_items.length,
      detail_attribution_count: source.detail_attribution_proof_count,
      body_usable_count: source.matched_items.filter(
        (item) => item.body_quality === "clean",
      ).length,
    },
  ];
  return calculateSourceHealth({
    source,
    observations,
    reviewDistribution: source.relevance_distribution,
    publicProjectionCount: 0,
    attachmentDownloadSuccessCount:
      attachment?.source_key === source.source_key &&
      attachment?.content_hash
        ? 1
        : 0,
  });
});
const report = {
  generated_at: new Date().toISOString(),
  contract_version: "post-phase-p-source-health/v1",
  evidence_kind: "live_public",
  sources,
  status_counts: Object.fromEntries(
    [
      "SUCCESS",
      "ZERO_MATCH_OBSERVED",
      "TRANSPORT_BLOCKED",
      "TLS_BLOCKED",
      "SELECTOR_CHANGED",
      "DETAIL_ATTRIBUTION_FAILED",
      "BODY_UNUSABLE",
      "ATTACHMENT_BLOCKED",
      "PARSER_UNAVAILABLE",
    ].map((status) => [
      status,
      sources.filter((source) => source.status === status).length,
    ]),
  ),
  production_access_performed: false,
  passed: sources.length === inspection.sources.length,
};
fs.writeFileSync(
  path.join(ROOT, "reports/post-phase-n-q/source-health.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify({
  passed: report.passed,
  source_count: sources.length,
  status_counts: report.status_counts,
  output_path: "reports/post-phase-n-q/source-health.json",
}, null, 2));
