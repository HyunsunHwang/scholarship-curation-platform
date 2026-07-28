import assert from "node:assert/strict";
import {
  applyPlanToMemory,
  buildNormalizedGraphPlan,
  canonicalizeNoticeUrl,
  sha256,
} from "../lib/post-phase-l/normalized-graph.mjs";
import {
  buildImmutableCrawlerHandoff,
  evaluateHandoffDownstreamReadiness,
  HANDOFF_STATUS_READY,
  validateCrawlerHandoff,
} from "../lib/crawler-engine/crawler-handoff.mjs";
import { resolveNoticeIdentity } from "../lib/crawler-engine/notice-identity-resolver.mjs";

function buildPlan(sourceResults, idempotencyKey = "phase0-identity-fixture") {
  return buildNormalizedGraphPlan({
    run: { idempotency_key: idempotencyKey },
    source_results: sourceResults,
  }, { generatedAt: "2026-07-28T00:00:00.000Z" });
}

// Case 1 — external article ID notice
{
  const plan = buildPlan([{
    source_key: "case1_source",
    source_id: "case1_source",
    notices: [{
      title: "교내 장학금 모집",
      body: "본문입니다. ".repeat(20),
      notice_url: "https://uni.example/board/view?articleNo=42",
      canonical_url: "https://uni.example/board/view?articleNo=42",
      external_article_id: "articleNo:42",
    }],
  }], "phase0-case-1");
  assert.equal(plan.tables.ingestion_notices.length, 1);
  assert.equal(plan.tables.ingestion_notices[0].identity_kind, "external_article_id");
  assert.equal(plan.tables.ingestion_notices[0].identity_key, "external:articleNo:42");
  assert.equal(plan.tables.ingestion_notices[0].external_article_id, "articleNo:42");
}

// Case 2 — canonical URL notice
{
  const plan = buildPlan([{
    source_key: "case2_source",
    source_id: "case2_source",
    notices: [{
      title: "학과 장학 안내",
      body: "본문입니다. ".repeat(20),
      notice_url: "https://uni.example/dept/notice/99",
      canonical_url: "https://uni.example/dept/notice/99",
    }],
  }], "phase0-case-2");
  const canonical = canonicalizeNoticeUrl("https://uni.example/dept/notice/99");
  assert.equal(plan.tables.ingestion_notices.length, 1);
  assert.equal(plan.tables.ingestion_notices[0].identity_kind, "canonical_detail_url");
  assert.equal(plan.tables.ingestion_notices[0].identity_key, `url:${sha256(canonical)}`);
  assert.equal(plan.tables.ingestion_notices[0].external_article_id, null);
}

// Case 3 — multiple sections on one page collapse to one Notice
{
  const page = "https://uni.example/inline/notices";
  const notices = [1, 2, 3].map((index) => ({
    title: `Section ${index} scholarship`,
    body: `Section ${index} body with enough text for preservation and review. `.repeat(3),
    notice_url: `${page}#section-${index}`,
    original_url: `${page}#section-${index}`,
    canonical_url: page,
    inline_section_id: `section-${index}`,
    section_order: index,
    inline_section_links: [{ url: `https://forms.example/${index}`, role: "application_form" }],
    attachment_metadata: [{ url: `https://files.example/${index}.pdf`, name: `file-${index}` }],
  }));
  const plan = buildPlan([{
    source_key: "case3_source",
    source_id: "case3_source",
    notices,
  }], "phase0-case-3");
  assert.equal(plan.tables.ingestion_notices.length, 1);
  assert.equal(plan.tables.ingestion_notice_occurrences.length, 1);
  assert.equal(plan.tables.ingestion_notice_revisions.length, 1);
  assert.equal(plan.tables.ingestion_notices[0].identity_kind, "canonical_detail_url");
  assert.notEqual(plan.tables.ingestion_notices[0].identity_kind, "inline_section_id");
  const sections = plan.tables.ingestion_notice_revisions[0].normalized_payload.inline_sections;
  assert.equal(sections.length, 3);
  assert.deepEqual(sections.map((row) => row.section_id), ["section-1", "section-2", "section-3"]);
  assert.ok(sections.every((row) => row.section_title && row.section_text && row.section_links.length === 1));
  assert.equal(plan.tables.ingestion_notice_url_aliases.length, 1);
  assert.equal(plan.tables.ingestion_notice_assets.length, 3);
}

// Case 4 — replay is deterministic and idempotent in memory
{
  const input = {
    source_key: "case4_source",
    source_id: "case4_source",
    notices: [{
      title: "Replay scholarship",
      body: "Replay body ".repeat(20),
      notice_url: "https://uni.example/replay/1",
      canonical_url: "https://uni.example/replay/1",
      inline_section_id: "ignored-for-identity",
      inline_section_links: [{ url: "https://forms.example/replay", role: "application_form" }],
    }],
  };
  const first = buildPlan([input], "phase0-case-4");
  const second = buildPlan([input], "phase0-case-4");
  assert.deepEqual(second, first);
  const firstApply = applyPlanToMemory({}, first);
  const secondApply = applyPlanToMemory(firstApply.state, second);
  assert.equal(secondApply.inserted.ingestion_notices, 0);
  assert.equal(secondApply.inserted.ingestion_notice_url_aliases, 0);
}

// Case 5 — different sources may share one normalized URL
{
  const sharedUrl = "https://shared.example/notice/1";
  const plan = buildPlan([
    {
      source_key: "case5_a",
      source_id: "case5_a",
      notices: [{
        title: "Source A",
        body: "Body A ".repeat(20),
        notice_url: sharedUrl,
        canonical_url: sharedUrl,
      }],
    },
    {
      source_key: "case5_b",
      source_id: "case5_b",
      notices: [{
        title: "Source B",
        body: "Body B ".repeat(20),
        notice_url: sharedUrl,
        canonical_url: sharedUrl,
      }],
    },
  ], "phase0-case-5");
  assert.equal(plan.tables.ingestion_notices.length, 2);
  assert.equal(new Set(plan.tables.ingestion_notices.map((row) => row.source_id)).size, 2);
  assert.equal(plan.tables.ingestion_notice_url_aliases.length, 2);
  assert.equal(
    new Set(plan.tables.ingestion_notice_url_aliases.map((row) => `${row.source_id}|${row.normalized_url_hash}`)).size,
    2,
  );
}

// Case 6 — section metadata preservation through handoff → graph
{
  const page = "https://uni.example/preserve";
  const observation = {
    title: "Preserved section title",
    body: "Preserved section text with enough characters for quality checks. ".repeat(2),
    notice_url: `${page}#keep-me`,
    original_url: `${page}#keep-me`,
    canonical_url: page,
    inline_section_id: "keep-me",
    inline_section_links: [{ url: "https://forms.example/keep", role: "application_form", label: "Apply" }],
    inline_date_evidence: [{ role: "application_start_date", rawText: "2026-08-01" }],
    candidate_classification: "candidate",
    candidate_reason_codes: ["keyword_and_date_within_range"],
    attachment_metadata: [],
    identity_stability: "strong",
  };
  const identity = resolveNoticeIdentity(observation);
  assert.equal(identity.identity_kind, "canonical_detail_url");
  assert.equal(identity.inline_section_id, "keep-me");

  const handoff = buildImmutableCrawlerHandoff({
    sourceResults: [{
      source_id: "case6_source",
      result_status: "success",
      notices: [observation],
    }],
    generatedAt: "2026-07-28T00:00:00.000Z",
  });
  assert.equal(validateCrawlerHandoff(handoff).valid, true);
  assert.equal(handoff.sourceResults[0].downstream_handoff_status, HANDOFF_STATUS_READY);
  assert.equal(handoff.sourceResults[0].notices[0].inline_sections[0].section_id, "keep-me");
  assert.equal(
    evaluateHandoffDownstreamReadiness(handoff.sourceResults[0].notices).status,
    HANDOFF_STATUS_READY,
  );

  const plan = buildPlan([{
    source_key: "case6_source",
    source_id: "case6_source",
    notices: handoff.sourceResults[0].notices,
  }], "phase0-case-6");
  const preserved = plan.tables.ingestion_notice_revisions[0].normalized_payload.inline_sections[0];
  assert.equal(preserved.section_id, "keep-me");
  assert.equal(preserved.section_title, "Preserved section title");
  assert.match(preserved.section_text, /Preserved section text/);
  assert.equal(preserved.section_links[0].url, "https://forms.example/keep");
  assert.equal(plan.tables.ingestion_notices[0].identity_kind, "canonical_detail_url");
}

console.log("PASS phase-0 identity/schema alignment fixtures");
