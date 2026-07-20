import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildReplayReport } from "./run-engine-phase-5-semantic-review.mjs";
import { validateSemanticReviewProposal } from "../lib/engine-phase-5/semantic-review-validator.mjs";
import { callConfiguredLlm, getConfiguredLlmMetadata } from "../lib/llm/provider-client.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const report = read("reports/engine-phase-5-semantic-review.json");
const fullGateC = read("reports/engine-phase-4-gate-c-remediated.json");
const recordByCase = new Map(fullGateC.case_results.map((item, index) => [item.case_id, fullGateC.records[index]]));
const resultByCase = new Map(report.target_results.map((item) => [item.case_id, item]));
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
let passed = 0;

function test(name, run) {
  run();
  passed += 1;
  console.log(`PASS ${name}`);
}

async function testAsync(name, run) {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
}

test("organization role schema supports multiple semantic roles without flattening", () => {
  const proposal = resultByCase.get("p4c_006_gwangsan_extension").proposal;
  assert.equal(proposal.organization_role_assertions[0].roles.includes("scholarship_provider"), true);
  const mutation = structuredClone(proposal);
  mutation.organization_role_assertions[0].roles = ["posting_organization", "funding_organization"];
  assert.equal(validateSemanticReviewProposal({ proposal: mutation, record: recordByCase.get(mutation.case_id), inputRecordHash: mutation.input_record_hash }).schema_valid, true);
});

test("Case 20 preserves monthly and hourly benefit components", () => {
  const components = resultByCase.get("p4c_020_uic_supporters_table").proposal.benefit_components;
  assert.deepEqual(components.map((item) => item.component_kind), ["periodic_payment", "hourly_payment"]);
  assert.deepEqual(components.map((item) => item.amount), [200000, 10320]);
});

test("Case 17 preserves a multi-program proposal", () => {
  const proposal = resultByCase.get("p4c_017_uic_2025_fall").proposal;
  assert.equal(proposal.program_candidates.length, 3);
  assert.equal(proposal.benefit_components.length, 3);
  assert.equal(proposal.program_candidates.every((item) => item.benefit_types.includes("tuition_support")), true);
});

test("Case 20 preserves activity and work support types separately", () => {
  const proposal = resultByCase.get("p4c_020_uic_supporters_table").proposal;
  assert.deepEqual(proposal.program_candidates.map((item) => item.benefit_types), [["activity_scholarship"], ["work_scholarship"]]);
});

test("correction proposals remain relation-only and review-required", () => {
  for (const caseId of ["p4c_003_hope_ladder_extension", "p4c_006_gwangsan_extension"]) {
    const proposal = resultByCase.get(caseId).proposal;
    assert.equal(proposal.program_candidates.length, 0);
    assert.equal(proposal.cycle_candidates.length, 0);
    assert.equal(proposal.relation_proposals[0].automatic_resolution_allowed, false);
    assert.equal(proposal.relation_proposals[0].review_required, true);
  }
});

test("program proposal requires organization evidence", () => {
  const original = resultByCase.get("p4c_020_uic_supporters_table").proposal;
  const mutation = structuredClone(original);
  mutation.program_candidates[0].organization_assertion_refs = [];
  const result = validateSemanticReviewProposal({ proposal: mutation, record: recordByCase.get(mutation.case_id), inputRecordHash: mutation.input_record_hash });
  assert.equal(result.semantic_valid, false);
  assert.equal(result.errors.some((error) => error.startsWith("program_organization_missing")), true);
});

test("cycle proposal requires supported boundary evidence", () => {
  const original = resultByCase.get("p4c_020_uic_supporters_table").proposal;
  const mutation = structuredClone(original);
  Object.assign(mutation.cycle_candidates[0], { cycle_label: "Never Seen", academic_year: 2099, term: "Winter", application_window: null });
  const result = validateSemanticReviewProposal({ proposal: mutation, record: recordByCase.get(mutation.case_id), inputRecordHash: mutation.input_record_hash });
  assert.equal(result.errors.some((error) => error.startsWith("unsupported_cycle_boundary")), true);
});

test("dangling evidence is rejected and retained for review", () => {
  const original = resultByCase.get("p4c_012_history_central_love").proposal;
  const mutation = structuredClone(original);
  mutation.benefit_components[0].evidence_refs = ["missing-evidence"];
  const result = validateSemanticReviewProposal({ proposal: mutation, record: recordByCase.get(mutation.case_id), inputRecordHash: mutation.input_record_hash });
  assert.equal(result.evidence_reference_valid, false);
  assert.equal(result.proposal.review.proposal_status, "rejected_by_validator");
});

test("unsupported organization assertion is rejected", () => {
  const original = resultByCase.get("p4c_020_uic_supporters_table").proposal;
  const mutation = structuredClone(original);
  mutation.organization_role_assertions[0].organization_name = "Invented Foundation";
  const result = validateSemanticReviewProposal({ proposal: mutation, record: recordByCase.get(mutation.case_id), inputRecordHash: mutation.input_record_hash });
  assert.equal(result.errors.some((error) => error.startsWith("unsupported_organization")), true);
});

test("unsupported amount assertion is rejected", () => {
  const original = resultByCase.get("p4c_020_uic_supporters_table").proposal;
  const mutation = structuredClone(original);
  mutation.benefit_components[0].raw_text = "KRW 999,999 per week";
  const result = validateSemanticReviewProposal({ proposal: mutation, record: recordByCase.get(mutation.case_id), inputRecordHash: mutation.input_record_hash });
  assert.equal(result.errors.some((error) => error.startsWith("unsupported_amount")), true);
});

test("terminal recruitment promotion is deterministically rejected", () => {
  assert.equal(report.negative_replay_proof.rejected, true);
  assert.equal(report.negative_replay_proof.errors.includes("terminal_recruitment_promotion"), true);
});

test("canonical Phase 4 identity records are never mutated", () => {
  const before = hash(fullGateC.records.map((record) => [record.program_identity_candidate, record.recruitment_cycle_identity_candidate]));
  buildReplayReport();
  const afterReport = read("reports/engine-phase-4-gate-c-remediated.json");
  const after = hash(afterReport.records.map((record) => [record.program_identity_candidate, record.recruitment_cycle_identity_candidate]));
  assert.equal(after, before);
  assert.equal(report.metrics.canonical_identity_auto_resolved_count, 0);
});

test("Case 12 17 and 20 sidecars preserve representation gaps", () => {
  assert.equal(report.representation_gap_preservation.length, 3);
  assert.equal(report.representation_gap_preservation.every((item) => item.preserved_without_canonical_mutation), true);
  assert.equal(report.metrics.schema_gap_collapsed_to_present_count, 0);
});

test("replay report is deterministic", () => {
  const first = buildReplayReport();
  const second = buildReplayReport();
  assert.deepEqual(first, second);
  assert.equal(report.deterministic_replay_match, true);
});

test("missing live credential fails safely without a provider call", () => {
  const env = { ...process.env };
  delete env.LLM_API_KEY;
  delete env.LLM_API_BASE;
  delete env.LLM_MODEL;
  delete env.LLM_PROVIDER;
  const result = spawnSync(process.execPath, ["scripts/run-engine-phase-5-semantic-review.mjs", "--mode", "live"], { cwd: root, env, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /live_run_completed=false/);
  assert.match(result.stdout, /live_run_blocker=missing_local_llm_credential/);
  assert.match(result.stdout, /live_call_count=0/);
});

test("provider metadata never returns a credential", () => {
  const metadata = getConfiguredLlmMetadata();
  assert.equal(Object.hasOwn(metadata, "apiKey"), false);
});

await testAsync("shared provider preserves OpenAI-compatible JSON calls", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { key: process.env.LLM_API_KEY, base: process.env.LLM_API_BASE, model: process.env.LLM_MODEL, provider: process.env.LLM_PROVIDER };
  let observed;
  process.env.LLM_API_KEY = "test-key-not-for-reporting";
  process.env.LLM_API_BASE = "https://llm.invalid/v1";
  process.env.LLM_MODEL = "test-model";
  process.env.LLM_PROVIDER = "openai";
  globalThis.fetch = async (url, options) => {
    observed = { url, options };
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await callConfiguredLlm({ systemPrompt: "system", userPrompt: "user", jsonObject: true });
    assert.equal(result.content, "{\"ok\":true}");
    assert.equal(observed.url, "https://llm.invalid/v1/chat/completions");
    assert.equal(JSON.parse(observed.options.body).response_format.type, "json_object");
    assert.equal(result.metadata.provider, "openai");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({ LLM_API_KEY: originalEnv.key, LLM_API_BASE: originalEnv.base, LLM_MODEL: originalEnv.model, LLM_PROVIDER: originalEnv.provider })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

await testAsync("shared provider preserves Anthropic message calls", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { key: process.env.LLM_API_KEY, base: process.env.LLM_API_BASE, model: process.env.LLM_MODEL, provider: process.env.LLM_PROVIDER };
  let observed;
  process.env.LLM_API_KEY = "test-anthropic-key";
  process.env.LLM_API_BASE = "https://anthropic.invalid/v1";
  process.env.LLM_MODEL = "test-claude";
  process.env.LLM_PROVIDER = "anthropic";
  globalThis.fetch = async (url, options) => {
    observed = { url, options };
    return new Response(JSON.stringify({ content: [{ type: "text", text: "{\"ok\":true}" }], usage: { input_tokens: 3, output_tokens: 2 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await callConfiguredLlm({ systemPrompt: "system", userPrompt: "user", jsonObject: true });
    assert.equal(result.content, "{\"ok\":true}");
    assert.equal(observed.url, "https://anthropic.invalid/v1/messages");
    assert.equal(observed.options.headers["anthropic-version"], "2023-06-01");
    assert.equal(result.metadata.provider, "anthropic");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({ LLM_API_KEY: originalEnv.key, LLM_API_BASE: originalEnv.base, LLM_MODEL: originalEnv.model, LLM_PROVIDER: originalEnv.provider })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test("tracked outputs contain no credential or local path", () => {
  const text = fs.readFileSync(path.join(root, "reports/engine-phase-5-semantic-review.json"), "utf8")
    + fs.readFileSync(path.join(root, "reports/engine-phase-5-semantic-review.md"), "utf8");
  assert.doesNotMatch(text, /LLM_API_KEY|Authorization|x-api-key|\/Users\/|[A-Za-z]:\\/);
  assert.doesNotMatch(text, /sk-(?:ant-)?[A-Za-z0-9_-]{16,}/);
});

console.log(`${passed}/${passed} Phase 5 semantic review tests passed`);
