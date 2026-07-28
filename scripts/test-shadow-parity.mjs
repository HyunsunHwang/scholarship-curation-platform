import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildImmutableCrawlerHandoff } from "../lib/crawler-engine/crawler-handoff.mjs";
import { applyPlanToMemory } from "../lib/post-phase-l/normalized-graph.mjs";
import { buildGraphPlanFromHandoff } from "../lib/post-phase-l/handoff-to-graph-adapter.mjs";
import { parseLegacyNoticeCsv } from "../lib/post-phase-l/legacy-notice-artifact.mjs";
import {
  buildCanonicalParityPayload,
  datePresence,
  hashCanonicalParityPayload,
} from "../lib/post-phase-l/shadow-parity.mjs";
import {
  evaluateDeterministicRerun,
  runShadowParityCase,
} from "./run-shadow-parity-dry-run.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

const REQUIRED_CASE_IDS = [
  "external-article-id",
  "canonical-url-only",
  "inline-multi-section",
  "cross-source-same-url",
  "attachment-and-application-link",
  "missing-or-uncertain-date",
  "candidate-excluded-diagnostic",
  "body-and-inline-evidence-preservation",
];

const EXPECTED_BY_CASE = {
  "external-article-id": {
    primary: "explained_difference",
    reasonsInclude: ["IDENTITY_MODEL_DIFFERENCE"],
    blocking: 0,
  },
  "canonical-url-only": {
    primary: "explained_difference",
    reasonsInclude: ["IDENTITY_MODEL_DIFFERENCE"],
    blocking: 0,
  },
  "inline-multi-section": {
    primary: "explained_difference",
    reasonsInclude: ["INLINE_SECTIONS_COLLAPSED_TO_PAGE_NOTICE", "IDENTITY_MODEL_DIFFERENCE"],
    blocking: 0,
    inlineSections: 3,
  },
  "cross-source-same-url": {
    blocking: 0,
    requireExplainedReason: "LEGACY_GLOBAL_URL_DEDUPE_COLLAPSE",
  },
  "attachment-and-application-link": {
    primary: "explained_difference",
    reasonsInclude: ["IDENTITY_MODEL_DIFFERENCE"],
    blocking: 0,
    minAttachments: 2,
    minApplicationLinks: 1,
  },
  "missing-or-uncertain-date": {
    primary: "explained_difference",
    reasonsInclude: ["DATE_PRESENCE_ALIGNED_MISSING_OR_UNPARSED", "IDENTITY_MODEL_DIFFERENCE"],
    blocking: 0,
    forbidFabricatedDate: true,
  },
  "candidate-excluded-diagnostic": {
    primary: "explained_difference",
    reasonsInclude: ["CANDIDATE_EXCLUDED_BOTH_PATHS", "IDENTITY_MODEL_DIFFERENCE"],
    blocking: 0,
    publicationEligible: false,
  },
  "body-and-inline-evidence-preservation": {
    primary: "explained_difference",
    reasonsInclude: ["INLINE_SECTIONS_COLLAPSED_TO_PAGE_NOTICE", "IDENTITY_MODEL_DIFFERENCE"],
    blocking: 0,
    inlineSections: 2,
  },
};

const corpus = readJson("fixtures/shadow-parity/corpus.json");
assert.deepEqual(
  corpus.required_case_ids.slice().sort(),
  REQUIRED_CASE_IDS.slice().sort(),
);
assert.deepEqual(
  corpus.cases.map((entry) => entry.id).sort(),
  REQUIRED_CASE_IDS.slice().sort(),
);

{
  const csv = [
    "source_group,source_id,title,notice_url,content",
    "parity,s1,Title A,https://example.test/a,Body A long enough",
    "parity,s2,Title B,https://example.test/a,Body B long enough",
  ].join("\n");
  const parsed = parseLegacyNoticeCsv(csv);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.duplicate_url_count, 1);
  assert.equal(parsed.dropped_records.length, 1);
  assert.equal(parsed.dropped_records[0].source_id, "s2");
}

const corpusRuns = [];
for (const entry of corpus.cases) {
  const fixture = readJson(path.join("fixtures/shadow-parity", entry.path));
  assert.equal(fixture.id, entry.id);
  const ran = runShadowParityCase(fixture, { caseId: entry.id });
  corpusRuns.push(ran);

  assert.equal(ran.report.summary.blocking_mismatch_count, 0, entry.id);
  assert.equal(ran.report.summary.missing_legacy_count, 0, entry.id);
  assert.equal(ran.report.summary.missing_graph_count, 0, entry.id);
  assert.equal(ran.report.summary.duplicate_graph_notice_count, 0, entry.id);
  assert.equal(ran.report.summary.unsupported_identity_kind_count, 0, entry.id);
  assert.equal(ran.report.summary.inline_section_evidence_loss_count, 0, entry.id);
  assert.equal(ran.report.summary.deterministic_rerun_match, true, entry.id);
  assert.equal(ran.report.gate_pass, true, entry.id);
  assert.equal(ran.report.safety.databaseWritePerformed, false);

  const expected = EXPECTED_BY_CASE[entry.id];
  assert.ok(expected, `missing expectation for ${entry.id}`);
  assert.equal(ran.report.summary.blocking_mismatch_count, expected.blocking);

  if (expected.primary) {
    const primaryRows = ran.report.comparisons.filter((row) => row.classification === expected.primary);
    assert.ok(primaryRows.length >= 1, `${entry.id} expected ${expected.primary}`);
    for (const code of expected.reasonsInclude ?? []) {
      assert.ok(
        primaryRows.some((row) => row.reason_codes.includes(code)),
        `${entry.id} missing reason ${code}`,
      );
    }
  }

  if (expected.requireExplainedReason) {
    const explained = ran.report.comparisons.filter((row) =>
      row.classification === "explained_difference"
      && row.reason_codes.includes(expected.requireExplainedReason));
    assert.ok(explained.length >= 1, `${entry.id} missing ${expected.requireExplainedReason}`);
    assert.equal(ran.report.classification_counts.blocking_mismatch, 0);
  }

  if (expected.inlineSections) {
    const sections = ran.adapted.plan.tables.ingestion_notice_revisions[0]
      .normalized_payload.inline_sections;
    assert.equal(sections.length, expected.inlineSections);
    assert.ok(sections.every((section) =>
      section.section_id && section.section_title && section.section_text != null));
  }

  if (expected.minAttachments) {
    assert.ok(
      ran.adapted.plan.tables.ingestion_notice_assets.length >= expected.minAttachments,
    );
    const comparison = ran.report.comparisons[0];
    assert.ok(comparison.normalized.attachment_count >= expected.minAttachments);
    assert.equal(
      comparison.legacy.attachment_count,
      comparison.normalized.attachment_count,
    );
  }

  if (expected.minApplicationLinks) {
    const comparison = ran.report.comparisons[0];
    assert.ok(comparison.normalized.application_links.length >= expected.minApplicationLinks);
    assert.deepEqual(
      [...comparison.legacy.application_links.map((link) => link.url || link)].sort(),
      [...comparison.normalized.application_links].sort(),
    );
  }

  if (expected.forbidFabricatedDate) {
    const comparison = ran.report.comparisons[0];
    assert.equal(datePresence(comparison.legacy.notice_posted_at || comparison.legacy.raw_date_text), "unparsed");
    assert.equal(datePresence(comparison.normalized.notice_posted_at || comparison.normalized.raw_date_text), "unparsed");
    assert.ok(!comparison.reason_codes.includes("FABRICATED_DATE"));
  }

  if (expected.publicationEligible === false) {
    const comparison = ran.report.comparisons[0];
    assert.equal(comparison.legacy.publication_eligible, false);
    assert.equal(comparison.normalized.publication_eligible, false);
  }

  // No loose field_mismatch acceptance.
  assert.equal(ran.report.classification_counts.blocking_mismatch, 0);
}

{
  const shared = corpusRuns.find((row) => row.case_id === "cross-source-same-url");
  assert.equal(shared.legacyArtifact.records.length, 1);
  assert.equal(shared.legacyArtifact.dropped_records.length, 1);
  assert.equal(shared.report.notice_counts?.normalized ?? shared.report.summary.normalized_notice_count, 2);
  assert.equal(shared.report.classification_counts.explained_difference >= 1, true);
  assert.ok(shared.report.comparisons.some((row) =>
    row.reason_codes.includes("LEGACY_GLOBAL_URL_DEDUPE_COLLAPSE")));
}

{
  const fixture = readJson("fixtures/shadow-parity/cases/canonical-url-only.json");
  const first = evaluateDeterministicRerun(fixture);
  const second = evaluateDeterministicRerun(fixture);
  assert.equal(first.deterministic_rerun_match, true);
  assert.equal(second.deterministic_rerun_match, true);
  assert.equal(first.firstHash, second.firstHash);
  assert.deepEqual(
    buildCanonicalParityPayload({
      ...first.firstReport,
      summary: { ...first.firstReport.summary, deterministic_rerun_match: true },
    }).comparisons,
    buildCanonicalParityPayload({
      ...second.firstReport,
      summary: { ...second.firstReport.summary, deterministic_rerun_match: true },
    }).comparisons,
  );
}

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
  assert.equal(adapted.plan.writes_performed, false);
  const memory = applyPlanToMemory({}, adapted.plan);
  const replay = applyPlanToMemory(memory.state, adapted.plan);
  assert.equal(Object.values(replay.inserted).every((count) => count === 0), true);
}

{
  // Full corpus deterministic hash set.
  const hashes = corpusRuns.map((row) => row.report.canonical_hash);
  assert.equal(hashes.length, 8);
  assert.equal(new Set(hashes).size, 8);
  for (const ran of corpusRuns) {
    const again = runShadowParityCase(
      readJson(path.join("fixtures/shadow-parity", corpus.cases.find((entry) => entry.id === ran.case_id).path)),
      { caseId: ran.case_id },
    );
    assert.equal(again.report.canonical_hash, ran.report.canonical_hash);
    assert.equal(
      hashCanonicalParityPayload(buildCanonicalParityPayload(again.report)),
      hashCanonicalParityPayload(buildCanonicalParityPayload(ran.report)),
    );
  }
}

console.log("PASS phase 1 shadow parity gate remediation");
