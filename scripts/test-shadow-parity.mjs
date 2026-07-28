import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildImmutableCrawlerHandoff } from "../lib/crawler-engine/crawler-handoff.mjs";
import { applyPlanToMemory } from "../lib/post-phase-l/normalized-graph.mjs";
import { buildGraphPlanFromHandoff } from "../lib/post-phase-l/handoff-to-graph-adapter.mjs";
import {
  loadLegacyNoticeArtifact,
  parseLegacyNoticeCsv,
} from "../lib/post-phase-l/legacy-notice-artifact.mjs";
import { compareShadowParity } from "../lib/post-phase-l/shadow-parity.mjs";
import { runShadowParityCase } from "./run-shadow-parity-dry-run.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

const corpus = readJson("fixtures/shadow-parity/corpus.json");
assert.ok(corpus.cases.length >= 4);

// Adapter maps handoff → graph plan without writes
{
  const fixture = readJson("fixtures/shadow-parity/cases/external-article-id.json");
  const handoff = buildImmutableCrawlerHandoff({
    sourceResults: fixture.source_results,
    generatedAt: fixture.generated_at,
  });
  const adapted = buildGraphPlanFromHandoff(handoff, {
    generatedAt: fixture.generated_at,
    idempotencyKey: fixture.idempotency_key,
  });
  assert.equal(adapted.safety.writes_performed, false);
  assert.equal(adapted.plan.writes_performed, false);
  assert.equal(adapted.plan.tables.ingestion_notices.length, 1);
  assert.equal(adapted.plan.tables.ingestion_notices[0].identity_kind, "external_article_id");
  assert.equal(adapted.blocked_sources.length, 0);
}

// Legacy CSV view mirrors required columns and URL dedupe
{
  const csv = [
    "source_group,source_id,title,notice_url,content",
    "parity,s1,Title A,https://example.test/a,Body A long enough",
    "parity,s2,Title B,https://example.test/a,Body B long enough",
  ].join("\n");
  const parsed = parseLegacyNoticeCsv(csv);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.duplicate_url_count, 1);
  assert.equal(parsed.records[0].source_id, "s1");
}

// Case matrix through dry-run runner
{
  const external = runShadowParityCase(
    readJson("fixtures/shadow-parity/cases/external-article-id.json"),
  );
  assert.equal(external.report.status_counts.matched, 1);
  assert.equal(external.report.hard_blockers.length, 0);
  assert.equal(external.report.safety.databaseWritePerformed, false);
  assert.equal(external.report.replay.second_insert_total, 0);

  const canonical = runShadowParityCase(
    readJson("fixtures/shadow-parity/cases/canonical-url-only.json"),
  );
  assert.equal(canonical.report.status_counts.matched, 1);
  assert.equal(
    canonical.adapted.plan.tables.ingestion_notices[0].identity_kind,
    "canonical_detail_url",
  );

  const inline = runShadowParityCase(
    readJson("fixtures/shadow-parity/cases/inline-multi-section.json"),
  );
  assert.equal(inline.adapted.plan.tables.ingestion_notices.length, 1);
  assert.equal(
    inline.adapted.plan.tables.ingestion_notice_revisions[0].normalized_payload.inline_sections.length,
    3,
  );
  assert.ok(
    inline.report.status_counts.matched
      + inline.report.status_counts.identity_mapping_review
      + inline.report.status_counts.field_mismatch >= 1,
  );
  assert.equal(inline.report.notice_counts.normalized, 1);

  const shared = runShadowParityCase(
    readJson("fixtures/shadow-parity/cases/cross-source-same-url.json"),
  );
  // Legacy URL dedupe keeps one row; normalized keeps one Notice per source.
  assert.equal(shared.legacyArtifact.records.length, 1);
  assert.equal(shared.legacyArtifact.duplicate_url_count, 1);
  assert.equal(shared.report.notice_counts.normalized, 2);
  assert.equal(shared.report.status_counts.matched, 1);
  assert.equal(shared.report.status_counts.normalized_only, 1);
}

// Replay idempotency for same artifact
{
  const fixture = readJson("fixtures/shadow-parity/cases/canonical-url-only.json");
  const first = runShadowParityCase(fixture);
  const second = runShadowParityCase(fixture);
  assert.deepEqual(second.adapted.plan, first.adapted.plan);
  const memory = applyPlanToMemory({}, first.adapted.plan);
  const replay = applyPlanToMemory(memory.state, second.adapted.plan);
  assert.equal(Object.values(replay.inserted).every((count) => count === 0), true);
}

// Comparator classifications
{
  const legacyArtifact = loadLegacyNoticeArtifact([
    {
      source_id: "only_legacy",
      source_group: "parity",
      title: "Legacy only",
      notice_url: "https://example.test/legacy-only",
      content: "legacy body",
    },
  ]);
  const report = compareShadowParity({
    legacyArtifact,
    adapted: {
      plan: {
        tables: {
          ingestion_notices: [{
            id: "n1",
            source_id: "only_normalized",
            identity_kind: "canonical_detail_url",
            identity_key: "url:abc",
            canonical_url: "https://example.test/normalized-only",
          }],
          ingestion_notice_revisions: [{
            notice_id: "n1",
            title: "Normalized only",
            body: "normalized body",
            body_quality_status: "short_body_needs_review",
            normalized_payload: {},
          }],
          ingestion_notice_occurrences: [{
            notice_id: "n1",
            raw_date_text: null,
          }],
          ingestion_notice_assets: [],
          ingestion_notice_url_aliases: [],
        },
      },
      blocked_sources: [],
      validation: { valid: true, errors: [] },
      graph_input: { source_results: [{ source_id: "only_normalized" }] },
    },
    generatedAt: "2026-07-28T03:00:00.000Z",
  });
  assert.equal(report.status_counts.legacy_only, 1);
  assert.equal(report.status_counts.normalized_only, 1);
}

console.log("PASS shadow parity dry-run adapter, fixtures, replay, and report classifications");
