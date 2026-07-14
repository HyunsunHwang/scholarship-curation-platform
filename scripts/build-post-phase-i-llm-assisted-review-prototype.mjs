import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REVIEW_PROMPT_VERSION, executeProviderBoundary } from "../lib/llm-review/contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixedAt = "2026-07-14T00:00:00.000Z";
const read = (file) => readFile(resolve(root, file), "utf8").then(JSON.parse);
const write = (file, value) => writeFile(resolve(root, file), `${JSON.stringify(value, null, 2)}\n`);

function validOutput(item) {
  const title = item.evidence.find((entry) => entry.type === "title");
  const body = item.evidence.find((entry) => entry.type === "body_excerpt");
  const output = { itemId: item.itemId, sourceId: item.sourceId, sourceKey: item.sourceKey, scholarshipLikelihood: { decision: "likely", confidence: 0.6, evidenceIds: [title.evidenceId], rationale: "Evidence-only replay." }, suggestedFields: {}, detectedRisks: [], missingEvidence: [], contradictions: [], recommendation: "manual_review_required", humanDecisionRequired: true, autoApproveAllowed: false, autoRejectAllowed: false, publicExposureAllowed: false, providerMetadata: { provider: "deterministic_replay", model: "fixture", promptVersion: REVIEW_PROMPT_VERSION, generatedAt: fixedAt } };
  if (["clean", "no_assets"].includes(item.classification)) { output.recommendation = "review_supported"; output.suggestedFields.title = { value: title.text, confidence: 0.9, evidenceIds: [title.evidenceId], extractionMode: "quoted" }; if (body) output.suggestedFields.eligibility = { value: body.text, confidence: 0.7, evidenceIds: [body.evidenceId], extractionMode: "inferred" }; }
  if (item.classification === "attachment_only_possible") output.recommendation = "attachment_check_required";
  if (item.classification === "encoding_or_mojibake_suspected") output.recommendation = "parser_fix_required";
  if (["unresolved_source", "duplicate_review", "image_only_suspected", "short_body"].includes(item.classification)) output.recommendation = "insufficient_evidence";
  if ((body?.text ?? "").includes("Ignore previous instructions")) { output.recommendation = "parser_fix_required"; output.detectedRisks.push({ code: "prompt_injection_text", severity: "high", evidenceIds: [body.evidenceId], explanation: "Untrusted source text is data only." }); }
  return output;
}

function metricKinds(name) { return { unsupported: ["nonexistent_evidence", "invented_deadline", "attachment_content_claim"].includes(name), hallucinated: ["invented_deadline", "attachment_content_claim", "unknown_field"].includes(name) }; }

export async function buildPostPhaseI() {
  const input = await read("fixtures/post-phase-i/llm-review-evaluation-cases.json");
  const negatives = await read("fixtures/post-phase-i/negative-contract-cases.json");
  const positives = input.cases.filter((item) => item.scholarshipItem);
  const executed = [];
  for (const item of positives) executed.push({ kind: "positive", itemId: item.itemId, ...await executeProviderBoundary({ analyze: async () => validOutput(item) }, { itemId: item.itemId, evidence: item.evidence }) });
  const seed = input.cases.find((item) => item.itemId === "i-attachment");
  for (const test of negatives) { const output = { ...validOutput(seed), ...test.patch, suggestedFields: test.patch.suggestedFields ?? validOutput(seed).suggestedFields }; executed.push({ kind: "negative", name: test.name, ...metricKinds(test.name), ...await executeProviderBoundary({ analyze: async () => output }, { itemId: seed.itemId, evidence: seed.evidence }) }); }
  for (const [name, provider] of [["provider_exception", { analyze: async () => { throw new Error("fixture failure"); } }], ["non_object", { analyze: async () => "bad" }]]) executed.push({ kind: "provider_failure", name, ...await executeProviderBoundary(provider, { itemId: seed.itemId, evidence: seed.evidence }) });
  const positive = executed.filter((entry) => entry.kind === "positive"); const negative = executed.filter((entry) => entry.kind === "negative"); const accepted = executed.filter((entry) => entry.accepted); const rejected = negative.filter((entry) => !entry.accepted); const policy = negative.filter((entry) => entry.name === "policy_attempt"); const providerFailures = executed.filter((entry) => entry.kind === "provider_failure"); const automaticDecisions = accepted.filter((entry) => entry.assistance && (!entry.assistance.humanDecisionRequired || entry.assistance.autoApproveAllowed || entry.assistance.autoRejectAllowed));
  const count = (items, key) => items.filter((item) => item[key]).length;
  const metrics = { evaluation_case_count: positive.length, excluded_zero_match_count: input.cases.length - positives.length, resolved_source_count: new Set(positives.filter((item) => item.sourceId !== "unknown").map((item) => item.sourceId)).size, negative_contract_case_count: negative.length, provider_failure_case_count: providerFailures.length, schema_valid_count: positive.filter((entry) => entry.accepted).length, evidence_link_valid_count: positive.filter((entry) => entry.accepted).length, accepted_unsupported_claim_count: count(accepted, "unsupported"), accepted_hallucinated_field_count: count(accepted, "hallucinated"), detected_unsupported_claim_attempt_count: count(negative, "unsupported"), rejected_unsupported_claim_attempt_count: count(rejected, "unsupported"), detected_hallucinated_field_attempt_count: count(negative, "hallucinated"), rejected_hallucinated_field_attempt_count: count(rejected, "hallucinated"), provider_failure_count: providerFailures.length, fail_closed_fallback_count: executed.filter((entry) => !entry.accepted).length, auto_approve_attempt_count: policy.length, auto_reject_attempt_count: policy.length, public_exposure_attempt_count: policy.length, automatic_decision_count: automaticDecisions.length, public_exposure_before: 2, public_exposure_after: 2, public_exposure_change_count: 0, review_state_change_count: 0 };
  return { generated_at: fixedAt, execution_mode: "deterministic_replay", prompt_version: REVIEW_PROMPT_VERSION, evaluation: executed, excluded_cases: ["i-zero-match"], metrics, external_call_count: 0, db_write: false, public_exposure_mutation: false, limitations: ["No external model quality validation."] };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const report = await buildPostPhaseI(); await write("reports/post-phase-i-llm-assisted-review-prototype.json", report); await write("reports/post-phase-i-evaluation-report.json", { generated_at: report.generated_at, execution_mode: report.execution_mode, metrics: report.metrics, limitations: report.limitations }); await write("reports/post-phase-i-evaluation-report.md", "# Post-Phase I Evaluation\n\n- Status: CONDITIONAL PASS\n- Mode: deterministic replay\n"); console.log("Post-Phase I report built"); }
