import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSources, mapRawSource, parseSourceInput, readSourceConfigFromCsv } from "../lib/notice-sources-loader.mjs";
import { loadNoticeSourceManifestRegistry } from "../lib/notice-source-manifest-loader.mjs";
import { readManifestJson, sha256Canonical, validateNoticeSourceManifests } from "../lib/notice-source-manifest-validator.mjs";
import { buildCrawlerReport } from "../lib/crawler-engine/runtime-diagnostics/report-builder.mjs";

const root = path.resolve("config/notice-sources");
let passed = 0;
async function test(name, fn) { try { await fn(); passed += 1; console.log(`ok - ${name}`); } catch (error) { console.error(`not ok - ${name}: ${error.message}`); process.exitCode = 1; } }
function manifests() { const index = readManifestJson(path.join(root, "manifest-index.json")); return { index, snapshot: readManifestJson(path.join(root, "db-source-id-snapshot.json")), manifests: index.groups.map((entry) => readManifestJson(path.join(root, entry.path))) }; }

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
await test("CSV and manifest produce identical canonical SourceConfig rows", () => { const csv = readSourceConfigFromCsv("data/notice-sources.csv").sort((a, b) => a.sourceId.localeCompare(b.sourceId)); const manifest = loadNoticeSourceManifestRegistry({ includeDisabled: true }).sources.map(mapRawSource); assert.deepEqual(manifest, csv); });
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
await test("actual source files are deterministic UTF-8 JSON", () => { for (const group of manifests().index.groups) assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(root, group.path), "utf8"))); });
await test("runtime report includes an additive manifest fingerprint", () => {
  const sourceRegistry = loadNoticeSourceManifestRegistry({ universitySlug: "ewha" }).fingerprint;
  assert.deepEqual(buildCrawlerReport({ runAt: "2026-07-23T00:00:00.000Z", sourceMode: "manifest", sourceRegistry }).sourceRegistry, sourceRegistry);
});

console.log(`manifest_tests_passed=${passed}`);
