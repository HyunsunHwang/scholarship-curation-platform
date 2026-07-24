// Read-only registry exporter. It never mutates Supabase; writes are limited to Git manifest files.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapRawSource,
  readSourceConfigFromCsv,
  readSourceConfigFromDb,
} from "../lib/notice-sources-loader.mjs";
import {
  NOTICE_SOURCE_MANIFEST_ROOT,
  SUPPORTED_UNIVERSITY_GROUPS,
  sourceIdSetSha256,
} from "../lib/notice-source-manifest-validator.mjs";
import { loadNoticeSourceManifestRegistry } from "../lib/notice-source-manifest-loader.mjs";

const MANIFEST_VERSION = "2026-07-24.1";
const SOURCE_FIELDS = Object.freeze([
  "sourceId", "universitySlug", "universityId", "collegeId", "departmentId", "orgUnitId",
  "collegeName", "departmentName", "sourceLevel", "sourceName", "listUrl", "baseUrl",
  "listItemSelector", "linkSelector", "titleSelector", "dateSelector", "detailContentSelector",
  "detailDateSelector", "noticeUrlPattern", "keywords", "adapter", "enabled",
]);

function stableJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }

export function canonicalRepositoryPath(filePath, { repositoryRoot = path.resolve(".") } = {}) {
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved);
  if (!relative || relative === ".") return ".";
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`CSV bootstrap path must be inside repository: ${filePath}`);
  }
  return relative.split(path.sep).join("/");
}

function normalizedSource(source) {
  const mapped = mapRawSource(source);
  return Object.fromEntries(SOURCE_FIELDS.map((key) => [key, mapped[key]]));
}

function manifestsFromSources(rawSources) {
  const sources = rawSources.map(normalizedSource).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const groups = Object.fromEntries(SUPPORTED_UNIVERSITY_GROUPS.map((group) => [group, []]));
  for (const source of sources) {
    if (!groups[source.universitySlug]) throw new Error(`Unsupported source universitySlug: ${source.sourceId} → ${source.universitySlug}`);
    groups[source.universitySlug].push(source);
  }
  return SUPPORTED_UNIVERSITY_GROUPS.map((universitySlug) => ({
    schemaVersion: "notice-source-manifest-v1",
    manifestVersion: MANIFEST_VERSION,
    universitySlug,
    sources: groups[universitySlug],
  }));
}

function buildFiles(rawSources, { provenance, parityStatus }) {
  const manifests = manifestsFromSources(rawSources);
  const sourceIds = manifests.flatMap((manifest) => manifest.sources.map((source) => source.sourceId)).sort();
  return {
    manifests,
    index: {
      schemaVersion: "notice-source-index-v1", manifestVersion: MANIFEST_VERSION,
      groups: SUPPORTED_UNIVERSITY_GROUPS.map((universitySlug) => ({ universitySlug, path: `universities/${universitySlug}.json` })),
    },
    snapshot: {
      schemaVersion: "db-source-id-snapshot-v1",
      capturedAt: parityStatus === "verified_from_db_read" ? new Date().toISOString() : "2026-07-23T00:00:00.000Z",
      provenance,
      parityStatus,
      sourceIds,
      sourceIdSetSha256: sourceIdSetSha256(sourceIds),
    },
  };
}

function writeFiles(files, rootDirectory) {
  fs.mkdirSync(path.join(rootDirectory, "universities"), { recursive: true });
  fs.writeFileSync(path.join(rootDirectory, "manifest-index.json"), stableJson(files.index), "utf8");
  fs.writeFileSync(path.join(rootDirectory, "db-source-id-snapshot.json"), stableJson(files.snapshot), "utf8");
  for (const manifest of files.manifests) {
    fs.writeFileSync(path.join(rootDirectory, "universities", `${manifest.universitySlug}.json`), stableJson(manifest), "utf8");
  }
}

function changedFileCount(files, rootDirectory) {
  const expected = [
    ["manifest-index.json", files.index], ["db-source-id-snapshot.json", files.snapshot],
    ...files.manifests.map((manifest) => [path.join("universities", `${manifest.universitySlug}.json`), manifest]),
  ];
  return expected.filter(([file, value]) => {
    const target = path.join(rootDirectory, file);
    return !fs.existsSync(target) || fs.readFileSync(target, "utf8") !== stableJson(value);
  }).length;
}

export async function exportNoticeSourceManifests({ fromCsv, check = false, rootDirectory = NOTICE_SOURCE_MANIFEST_ROOT, env = process.env } = {}) {
  const sourceMode = fromCsv ? "csv_bootstrap" : "db_read_only";
  const rawSources = fromCsv
    ? readSourceConfigFromCsv(fromCsv, { includeDisabled: true })
    : await readSourceConfigFromDb({ env, includeDisabled: true });
  const files = buildFiles(rawSources, fromCsv
    ? { provenance: `bootstrap_from_checked_in_csv:${canonicalRepositoryPath(fromCsv)}`, parityStatus: "unverified_without_db_read" }
    : { provenance: "read_only_select:public.notice_sources", parityStatus: "verified_from_db_read" });
  const changedFileCountValue = changedFileCount(files, rootDirectory);
  if (!check) writeFiles(files, rootDirectory);
  if (!check) loadNoticeSourceManifestRegistry({ rootDirectory });
  return { sourceMode, sourceCount: files.snapshot.sourceIds.length, changedFileCount: changedFileCountValue, check, parityStatus: files.snapshot.parityStatus };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--check") args.check = true;
    if (argv[index] === "--from-csv") { args.fromCsv = argv[index + 1]; index += 1; }
  }
  return args;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  exportNoticeSourceManifests(parseArgs(process.argv.slice(2))).then((result) => {
    console.log(JSON.stringify(result));
    if (result.check && result.changedFileCount > 0) process.exitCode = 1;
  }).catch((error) => { console.error(error?.message ?? error); process.exitCode = 1; });
}
