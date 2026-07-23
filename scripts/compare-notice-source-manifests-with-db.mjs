// Read-only parity checker. This script performs SELECTs only and never changes Supabase.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapRawSource, readSourceConfigFromDb } from "../lib/notice-sources-loader.mjs";
import { loadNoticeSourceManifestRegistry } from "../lib/notice-source-manifest-loader.mjs";
import { sanitizeRegistryUrl } from "../lib/notice-source-manifest-validator.mjs";

const FIELDS = ["universitySlug", "universityId", "collegeId", "departmentId", "orgUnitId", "collegeName", "departmentName", "sourceLevel", "sourceName", "listUrl", "baseUrl", "listItemSelector", "linkSelector", "titleSelector", "dateSelector", "detailContentSelector", "detailDateSelector", "noticeUrlPattern", "keywords", "adapter", "enabled"];
const root = path.resolve("reports/source-registry-parity");

function normalize(source) { return mapRawSource(source); }
function safe(source) { return { ...source, listUrl: sanitizeRegistryUrl(source.listUrl), baseUrl: sanitizeRegistryUrl(source.baseUrl) }; }
function equal(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

export function compareCanonicalSources(manifestSources, dbSources) {
  const byId = (sources) => {
    const map = new Map(); const duplicates = [];
    for (const source of sources) {
      if (map.has(source.sourceId)) duplicates.push(source.sourceId);
      else map.set(source.sourceId, source);
    }
    return { map, duplicates: [...new Set(duplicates)].sort() };
  };
  const manifest = byId(manifestSources.map(normalize)); const db = byId(dbSources.map(normalize));
  const missingInManifest = [...db.map.keys()].filter((id) => !manifest.map.has(id)).sort();
  const missingInDb = [...manifest.map.keys()].filter((id) => !db.map.has(id)).sort();
  const differences = [];
  for (const sourceId of [...manifest.map.keys()].filter((id) => db.map.has(id)).sort()) {
    const left = manifest.map.get(sourceId); const right = db.map.get(sourceId);
    const fields = FIELDS.filter((field) => !equal(left[field], right[field]));
    if (fields.length) differences.push({ sourceId, type: fields.includes("enabled") && fields.length === 1 ? "enabled_mismatch" : "field_mismatch", fields, manifest: safe(left), db: safe(right) });
  }
  return {
    missing_in_manifest: missingInManifest, missing_in_db: missingInDb,
    duplicate_source_id: { manifest: manifest.duplicates, db: db.duplicates },
    differences,
    summary: { missing_in_manifest_count: missingInManifest.length, missing_in_db_count: missingInDb.length, duplicate_source_id_count: manifest.duplicates.length + db.duplicates.length, field_mismatch_count: differences.filter((item) => item.type === "field_mismatch").length, enabled_mismatch_count: differences.filter((item) => item.type === "enabled_mismatch").length },
  };
}

export async function compareNoticeSourceManifestsWithDb({ outputDirectory = root, env = process.env } = {}) {
  const registry = loadNoticeSourceManifestRegistry({ includeDisabled: true });
  const dbSources = await readSourceConfigFromDb({ env, includeDisabled: true });
  const report = compareCanonicalSources(registry.sources, dbSources);
  const byGroup = new Map();
  for (const group of ["ewha", "cau", "korea", "khu", "hanyang", "hongik", "yonsei", "skku", "uos"]) {
    const manifestGroup = registry.sources.filter((source) => source.universitySlug === group);
    const dbGroup = dbSources.filter((source) => source.universitySlug === group);
    byGroup.set(group, compareCanonicalSources(manifestGroup, dbGroup));
  }
  const combined = { generated_at: new Date().toISOString(), mode: "read_only_db_parity", source_registry: registry.fingerprint, ...report, parity_passed: Object.values(report.summary).every((count) => count === 0) };
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, "combined.json"), `${JSON.stringify(combined, null, 2)}\n`, "utf8");
  for (const [group, groupReport] of byGroup) fs.writeFileSync(path.join(outputDirectory, `${group}.json`), `${JSON.stringify(groupReport, null, 2)}\n`, "utf8");
  return combined;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) compareNoticeSourceManifestsWithDb().then((report) => {
  console.log(JSON.stringify(report.summary)); if (!report.parity_passed) process.exitCode = 1;
}).catch((error) => { console.error(error?.message ?? error); process.exitCode = 1; });
