import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NOTICE_SOURCE_MANIFEST_ROOT,
  readManifestJson,
  sha256Canonical,
  validateNoticeSourceManifests,
} from "./notice-source-manifest-validator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, "..");

function readGitHead() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    const head = fs.readFileSync(path.join(repositoryRoot, ".git", "HEAD"), "utf8").trim();
    if (!head.startsWith("ref: ")) return head || null;
    return fs.readFileSync(path.join(repositoryRoot, ".git", head.slice(5)), "utf8").trim() || null;
  } catch { return null; }
}

export function loadNoticeSourceManifestRegistry({ universitySlug = "", rootDirectory = NOTICE_SOURCE_MANIFEST_ROOT, includeDisabled = false } = {}) {
  const indexPath = path.join(rootDirectory, "manifest-index.json");
  const snapshotPath = path.join(rootDirectory, "db-source-id-snapshot.json");
  const index = readManifestJson(indexPath);
  const snapshot = readManifestJson(snapshotPath);
  const manifests = (index.groups ?? []).map((entry) => {
    const filePath = path.resolve(rootDirectory, entry.path);
    if (!filePath.startsWith(`${path.resolve(rootDirectory)}${path.sep}`)) throw new Error(`Manifest path escapes registry root: ${entry.path}`);
    if (!fs.existsSync(filePath)) throw new Error(`Manifest file does not exist: ${entry.path}`);
    return readManifestJson(filePath);
  });
  const validation = validateNoticeSourceManifests({ index, manifests, snapshot, rootDirectory });
  if (!validation.valid) throw new Error(`Notice source manifest validation failed: ${validation.errors.join(" | ")}`);
  const requestedSlug = String(universitySlug ?? "").trim().toLowerCase();
  const selected = requestedSlug ? manifests.find((manifest) => manifest.universitySlug === requestedSlug) : null;
  if (requestedSlug && !selected) throw new Error(`Unsupported manifest university group: ${requestedSlug}`);
  const sources = (selected ? selected.sources : manifests.flatMap((manifest) => manifest.sources))
    .filter((source) => includeDisabled || source.enabled)
    .slice()
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  return {
    sources,
    fingerprint: {
      mode: "manifest",
      schemaVersion: selected?.schemaVersion ?? "notice-source-manifest-v1",
      manifestVersion: selected?.manifestVersion ?? index.manifestVersion,
      universitySlug: requestedSlug || null,
      sourceCount: sources.length,
      manifestSha256: sha256Canonical(selected ?? manifests),
      indexSha256: sha256Canonical(index),
      dbSnapshotSha256: snapshot.sourceIdSetSha256,
      commitSha: readGitHead(),
    },
  };
}
