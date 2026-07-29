import assert from "node:assert/strict";
import {
  MINIMAL_EVALUATION_MODEL,
  sha256,
  validateMinimalEvaluationOutput,
  validateMinimalFixture,
} from "../lib/analysis/minimal-evaluation-schema.mjs";

const body = "장학금액은 300만원이며 신청기간은 2026. 7. 1. ~ 2026. 7. 31.입니다.";
const fixture = [{ fixture_id: "ewha_068_1", source_id: "ewha_068", article_id: "1", title: "장학금 안내", published_at: "2026-07-01", original_url: "https://example.test/1", body_text: body, attachments: [], body_sha256: sha256(body), retrieved_at: "2026-07-29T00:00:00.000Z" }];
assert.equal(validateMinimalFixture(fixture).valid, false, "fixture must reject counts other than four");
const records = Array.from({ length: 4 }, (_, index) => ({ ...fixture[0], fixture_id: `ewha_068_${index + 1}`, article_id: String(index + 1), original_url: `https://example.test/${index + 1}` }));
assert.equal(validateMinimalFixture(records).valid, true);
const output = { scholarship_name: { value: "장학금", evidence: ["장학금액은 300만원"] }, organizer: { value: null, evidence: [] }, eligibility: [], benefits: [{ description: "지원", amount_krw: 3000000, evidence: "장학금액은 300만원" }], application_period: { start: "2026-07-01", end: "2026-07-31", raw_text: "2026. 7. 1. ~ 2026. 7. 31.", evidence: ["신청기간은 2026. 7. 1. ~ 2026. 7. 31.입니다."] }, required_documents: [], application_method: [], important_constraints: [], contact: [], unknown_or_ambiguous: [] };
assert.equal(validateMinimalEvaluationOutput(output, records[0]).valid, true);
assert.equal(validateMinimalEvaluationOutput({ ...output, eligibility: [{ condition: "없는 조건", evidence: "없는 근거" }] }, records[0]).valid, false);
assert.equal(validateMinimalEvaluationOutput({ ...output, benefits: [{ description: "지원", amount_krw: 3000000, evidence: "" }] }, records[0]).valid, false);
assert.equal(validateMinimalEvaluationOutput({ ...output, application_period: { ...output.application_period, start: "2026/07/01" } }, records[0]).valid, false);
assert.equal(MINIMAL_EVALUATION_MODEL, "claude-sonnet-4-6");
console.log("minimal llm evaluation tests passed");
