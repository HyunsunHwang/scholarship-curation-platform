import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadSources, mapRawSource, parseSourceInput, readSourceConfigFromCsv, readSourceConfigFromDb } from "../lib/notice-sources-loader.mjs";
import { loadNoticeSourceManifestRegistry } from "../lib/notice-source-manifest-loader.mjs";
import { readManifestJson, sha256Canonical, validateNoticeSourceManifests } from "../lib/notice-source-manifest-validator.mjs";
import { buildCrawlerReport } from "../lib/crawler-engine/runtime-diagnostics/report-builder.mjs";
import { canonicalRepositoryPath, exportNoticeSourceManifests } from "./export-notice-source-manifests.mjs";
import { compareCanonicalSources } from "./compare-notice-source-manifests-with-db.mjs";
import { resolveInputWithManifestRegistry } from "../lib/post-phase-l/source-resolver.mjs";

const root = path.resolve("config/notice-sources");
let passed = 0;
async function test(name, fn) { try { await fn(); passed += 1; console.log(`ok - ${name}`); } catch (error) { console.error(`not ok - ${name}: ${error.message}`); process.exitCode = 1; } }
function manifests() { const index = readManifestJson(path.join(root, "manifest-index.json")); return { index, snapshot: readManifestJson(path.join(root, "db-source-id-snapshot.json")), manifests: index.groups.map((entry) => readManifestJson(path.join(root, entry.path))) }; }
function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(sourcePath, destinationPath);
    else fs.copyFileSync(sourcePath, destinationPath);
  }
}

await test("manifest input parsing supports selected group", () => assert.deepEqual(parseSourceInput("manifest:ewha"), { mode: "manifest", csvPath: "", universitySlug: "ewha" }));
await test("actual registry validates and has all groups", () => assert.equal(loadNoticeSourceManifestRegistry({ includeDisabled: true }).sources.length, 545));
await test("unsupported manifest group fails closed", () => assert.throws(() => loadNoticeSourceManifestRegistry({ universitySlug: "unknown" }), /Unsupported manifest university group/));
await test("manifest loader is DB-free", async () => { const loaded = await loadSources("manifest:ewha", { env: {} }); assert.equal(loaded.mode, "manifest"); assert.equal(loaded.sourceRegistry.mode, "manifest"); assert.equal(loaded.sources.every((source) => source.enabled), true); });
await test("missing and malformed manifest files fail closed", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "notice-source-manifest-"));
  try {
    const malformed = path.join(temporary, "malformed.json");
    assert.throws(() => readManifestJson(path.join(temporary, "missing.json")), /JSON load failed/);
    fs.writeFileSync(malformed, "{bad json", "utf8");
    assert.throws(() => readManifestJson(malformed), /JSON load failed/);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
await test("deterministic ordering and hashes", () => { const first = loadNoticeSourceManifestRegistry({ universitySlug: "cau" }); const second = loadNoticeSourceManifestRegistry({ universitySlug: "cau" }); assert.deepEqual(first.sources.map((source) => source.sourceId), first.sources.map((source) => source.sourceId).slice().sort()); assert.equal(first.fingerprint.manifestSha256, second.fingerprint.manifestSha256); assert.equal(sha256Canonical(first.sources), sha256Canonical(second.sources)); });
await test("CSV and manifest preserve canonical crawl fields while manifest can add runtime contracts", () => {
  const topologyFields = new Set(["contentMode", "detailFetchRequired", "detailContentAlreadyAvailable", "sectionTitleSelector", "sectionBodyBoundary", "adapterConfig"]);
  const omitTopology = (source) => Object.fromEntries(Object.entries(source).filter(([key]) => !topologyFields.has(key)));
  const remediatedSourceIds = new Set(["cau_036", "cau_072", "korea_030", "korea_032", "korea_033", "uos_001"]);
  const runtimeContractFields = new Set([
    ...topologyFields,
    "listUrl",
    "baseUrl",
    "listItemSelector",
    "linkSelector",
    "titleSelector",
    "dateSelector",
    "detailContentSelector",
    "detailDateSelector",
    "noticeUrlPattern",
    "adapter",
  ]);
  const omitRuntimeContract = (source) => Object.fromEntries(Object.entries(source).filter(([key]) => !runtimeContractFields.has(key)));
  const csv = readSourceConfigFromCsv("data/notice-sources.csv").sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const manifest = loadNoticeSourceManifestRegistry({ includeDisabled: true }).sources.map(mapRawSource);
  assert.deepEqual(manifest.map((source) => source.sourceId), csv.map((source) => source.sourceId));
  for (let index = 0; index < manifest.length; index += 1) {
    if (remediatedSourceIds.has(manifest[index].sourceId)) {
      assert.deepEqual(omitRuntimeContract(manifest[index]), omitRuntimeContract(csv[index]));
    } else {
      assert.deepEqual(omitTopology(manifest[index]), omitTopology(csv[index]));
    }
  }
  const yonsei010 = manifest.find((source) => source.sourceId === "yonsei_010");
  assert.deepEqual(
    [yonsei010.contentMode, yonsei010.detailFetchRequired, yonsei010.detailContentAlreadyAvailable, yonsei010.sectionTitleSelector, yonsei010.sectionBodyBoundary],
    ["inline_sections", false, true, "h2, h3", "next_heading"],
  );
});
await test("CSV includeDisabled preserves disabled rows only when requested", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "notice-source-csv-"));
  const csvPath = path.join(temporary, "sources.csv");
  fs.writeFileSync(csvPath, "source_id,source_name,list_url,enabled\newha_001,Enabled,https://example.test,true\newha_002,Disabled,https://example.test,false\n", "utf8");
  try {
    assert.deepEqual(readSourceConfigFromCsv(csvPath).map((source) => source.sourceId), ["ewha_001"]);
    assert.deepEqual(readSourceConfigFromCsv(csvPath, { includeDisabled: true }).map((source) => source.sourceId), ["ewha_001", "ewha_002"]);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
await test("DB loader mock preserves disabled rows only when requested", async () => {
  const rows = [
    { source_id: "ewha_001", source_name: "Enabled", list_url: "https://example.test", enabled: true },
    { source_id: "ewha_002", source_name: "Disabled", list_url: "https://example.test", enabled: false },
  ];
  const createClientFactory = () => ({ from: () => {
    const query = {
      select: () => query,
      order: () => query,
      eq: () => query,
      range: () => query,
      then: (resolve) => resolve({ data: rows, error: null }),
    };
    return query;
  } });
  const options = { env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test" }, createClientFactory };
  assert.deepEqual((await readSourceConfigFromDb(options)).map((source) => source.sourceId), ["ewha_001"]);
  assert.deepEqual((await readSourceConfigFromDb({ ...options, includeDisabled: true })).map((source) => source.sourceId), ["ewha_001", "ewha_002"]);
});
await test("parity detects disabled source mismatch and missing disabled sources", () => {
  const enabled = mapRawSource({ sourceId: "ewha_001", sourceName: "Enabled", listUrl: "https://example.test", enabled: true });
  const disabled = mapRawSource({ sourceId: "ewha_002", sourceName: "Disabled", listUrl: "https://example.test", enabled: false });
  assert.equal(compareCanonicalSources([enabled], [enabled, disabled]).summary.missing_in_manifest_count, 1);
  assert.equal(compareCanonicalSources([enabled, disabled], [enabled]).summary.missing_in_db_count, 1);
  assert.equal(compareCanonicalSources([enabled], [{ ...enabled, enabled: false }]).summary.enabled_mismatch_count, 1);
});
await test("duplicate IDs, invalid URL, regex, prefix, slug, adapter, required enabled values and snapshot misses fail validation", () => {
  const fixture = manifests(); const source = fixture.manifests[0].sources[0];
  const variants = [
    (value) => { value.manifests[1].sources.push({ ...source, universitySlug: "cau", sourceId: "cau_duplicate" }); },
    (value) => { value.manifests[0].sources[0].listUrl = "ftp://example.test"; },
    (value) => { value.manifests[0].sources[0].noticeUrlPattern = "["; },
    (value) => { value.manifests[0].sources[0].sourceId = "cau_001"; },
    (value) => { value.manifests[0].sources[0].universitySlug = "cau"; },
    (value) => { value.manifests[0].sources[0].adapter = "unknown"; },
    (value) => { value.manifests[0].sources[0].sourceName = ""; },
    (value) => { value.manifests[0].sources[0].unexpected = true; },
    (value) => { value.manifests[0].schemaVersion = "wrong"; },
    (value) => { value.snapshot.sourceIds = value.snapshot.sourceIds.filter((id) => id !== source.sourceId); },
  ];
  for (const mutate of variants) { const value = structuredClone(fixture); mutate(value); assert.equal(validateNoticeSourceManifests(value).valid, false); }
});
await test("CAU adapterConfig is required and rejects unknown or untrimmed values", () => {
  const fixture = manifests();
  const cauManifest = fixture.manifests.find((manifest) => manifest.universitySlug === "cau");
  const source = cauManifest.sources.find((item) => item.sourceId === "cau_univ_001");
  const variants = [
    (value) => { delete value.adapterConfig; },
    (value) => { value.adapterConfig.apiAccept = " */* "; },
    (value) => { value.adapterConfig.jsonContentTypePolicy = "permissive"; },
    (value) => { value.adapterConfig.requiredListPath = "data.list[0]"; },
    (value) => { delete value.adapterConfig.requestUrlTemplate; },
    (value) => { value.adapterConfig.requestUrlTemplate = "not-a-url"; },
    (value) => { value.adapterConfig.detailUrlTemplate = "https://other.example/BoardView.do"; },
    (value) => { value.adapterConfig.unexpected = true; },
  ];
  for (const mutate of variants) {
    const value = structuredClone(source);
    mutate(value);
    const changed = structuredClone(fixture);
    const manifest = changed.manifests.find((item) => item.universitySlug === "cau");
    manifest.sources[manifest.sources.findIndex((item) => item.sourceId === source.sourceId)] = value;
    assert.equal(validateNoticeSourceManifests(changed).valid, false);
  }
});
await test("JSON API adapterConfig is declarative and fails closed when incomplete", () => {
  const fixture = manifests();
  const koreaManifest = fixture.manifests.find((manifest) => manifest.universitySlug === "korea");
  const source = koreaManifest.sources.find((item) => item.sourceId === "korea_033");
  assert.equal(source.adapter, "json_api_board");
  assert.equal(source.adapterConfig.requestUrlTemplate.includes("{page}"), true);
  assert.equal(source.adapterConfig.detailUrlTemplate.includes("{id}"), true);
  const variants = [
    (value) => { delete value.adapterConfig.requestUrlTemplate; },
    (value) => { value.adapterConfig.requestUrlTemplate = "https://api.example.test/board?page={unknown}"; },
    (value) => { value.adapterConfig.detailUrlTemplate = "not-a-url/{id}"; },
    (value) => { delete value.adapterConfig.fieldMap.title; },
  ];
  for (const mutate of variants) {
    const changed = structuredClone(fixture);
    const manifest = changed.manifests.find((item) => item.universitySlug === "korea");
    mutate(manifest.sources.find((item) => item.sourceId === source.sourceId));
    assert.equal(validateNoticeSourceManifests(changed).valid, false);
  }
});
await test("snapshot invariants, manifest version, and keyword normalization fail closed", () => {
  const fixture = manifests();
  const variants = [
    (value) => { value.snapshot.sourceIds.splice(1, 0, value.snapshot.sourceIds[0]); },
    (value) => { [value.snapshot.sourceIds[0], value.snapshot.sourceIds[1]] = [value.snapshot.sourceIds[1], value.snapshot.sourceIds[0]]; },
    (value) => { value.snapshot.sourceIdSetSha256 = "0".repeat(64); },
    (value) => { value.manifests[0].manifestVersion = "2026-07-23.2"; },
    (value) => { value.manifests[0].sources[0].keywords = [" keyword "]; },
  ];
  for (const mutate of variants) { const value = structuredClone(fixture); mutate(value); assert.equal(validateNoticeSourceManifests(value).valid, false); }
});
await test("CSV provenance uses deterministic repository POSIX paths", async () => {
  assert.equal(canonicalRepositoryPath(path.join(path.resolve("."), "data", "notice-sources.csv")), "data/notice-sources.csv");
  assert.equal(canonicalRepositoryPath("data/notice-sources.csv"), "data/notice-sources.csv");
  const result = await exportNoticeSourceManifests({ fromCsv: "data/notice-sources.csv", check: true });
  assert.equal(result.changedFileCount > 0, true); // Manifest-only topology contracts are intentionally not backfilled into legacy CSV.
});
await test("Post-Phase L dry-run and apply share manifest exact resolution", () => {
  const input = { source_results: [{ source_key: "ewha_003" }] };
  const dryRun = resolveInputWithManifestRegistry(input);
  const apply = resolveInputWithManifestRegistry(input);
  assert.deepEqual(dryRun, apply);
  assert.equal(dryRun.source_registry_resolution_mode, "manifest_exact");
  assert.equal(dryRun.fuzzy_source_match_count, 0);
  assert.equal(dryRun.automatic_source_create_count, 0);
  assert.throws(() => resolveInputWithManifestRegistry({ source_results: [{ source_key: "missing_999" }] }), /Manifest exact source resolution blocked/);
});
await test("Post-Phase L rejects a disabled manifest source in both paths", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "notice-source-registry-"));
  const temporaryRoot = path.join(temporary, "notice-sources");
  // Node 24.14 on Windows can terminate natively inside fs.cpSync() when the
  // repository path contains non-ASCII characters. Keep this fixture setup
  // deterministic with the primitive file APIs used by supported runtimes.
  copyDirectory(root, temporaryRoot);
  try {
    const filePath = path.join(temporaryRoot, "universities", "ewha.json");
    const manifest = readManifestJson(filePath);
    const source = manifest.sources.find((item) => item.sourceId === "ewha_003");
    source.enabled = false;
    fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const input = { source_results: [{ source_key: "ewha_003" }] };
    assert.throws(() => resolveInputWithManifestRegistry(input, { manifestRoot: temporaryRoot }), /Manifest source is disabled/);
    assert.throws(() => resolveInputWithManifestRegistry(input, { manifestRoot: temporaryRoot }), /Manifest source is disabled/);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
await test("actual source files are deterministic UTF-8 JSON", () => { for (const group of manifests().index.groups) assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(root, group.path), "utf8"))); });
await test("runtime report includes an additive manifest fingerprint", () => {
  const sourceRegistry = loadNoticeSourceManifestRegistry({ universitySlug: "ewha" }).fingerprint;
  assert.deepEqual(buildCrawlerReport({ runAt: "2026-07-23T00:00:00.000Z", sourceMode: "manifest", sourceRegistry }).sourceRegistry, sourceRegistry);
});

console.log(`manifest_tests_passed=${passed}`);
