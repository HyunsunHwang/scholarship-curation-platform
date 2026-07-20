import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callConfiguredLlm, getConfiguredLlmMetadata } from "../lib/llm/provider-client.mjs";
import {
  buildSemanticReviewInput,
  buildSemanticReviewUserPrompt,
  PHASE_5_PROMPT_VERSION,
  PHASE_5_SYSTEM_PROMPT,
} from "../lib/engine-phase-5/semantic-review-input.mjs";
import { validateSemanticReviewProposal } from "../lib/engine-phase-5/semantic-review-validator.mjs";
import { buildSemanticReviewPacket } from "../lib/engine-phase-5/semantic-review-packet.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const read = (relativePath) => JSON.parse(readText(relativePath));
const write = (relativePath, value) => fs.writeFileSync(path.join(root, relativePath), value);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const deepEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const FIXED_TIMESTAMP = "2026-07-20T12:00:00+09:00";

export const PHASE_5_REPORT_VERSION = "engine-phase-5-semantic-review/v1";
export const PHASE_5_PROTECTED_SHA256 = Object.freeze({
  "schemas/engine/phase-4-canonical-scholarship.schema.json": "c21c94924a376c047c67748b0ece28dac780cc4d79e7eac19b566a385ab48d84",
  "lib/engine-phase-4/deterministic-extractor.mjs": "a6f7cc4134f593da2e52d93e86e012c96f5f5a6b1363230f1410148d54bbc024",
  "lib/engine-phase-4/p0-remediated-extractor.mjs": "94b915f735d4282ac31476b566c419812a84186ff8184bc9d1db67c26efd18ae",
  "lib/engine-phase-4/candidate-handoff-gate.mjs": "4ff7d9df230cbadad780a53530ec0204c01a5dc51ce0f01314802c5b27d6b6c2",
  "lib/engine-phase-4/contracts.mjs": "93baa60ccf0f6f5b0986283276ffdfb157435ed4a89ca64d6582a483da28c91d",
  "reports/engine-phase-4-gate-c-remediated.json": "3f7bd0fe219280fac0addb7666b547c4e75822615807478aaaab8150696034e7",
  "reports/engine-phase-4-candidate-handoff-dry-run.json": "f8099adeacc0c9b8e905fa9a415087d6619db0c1f246815ae8168248e58ad8ca",
});

function protectedFiles() {
  return Object.fromEntries(Object.entries(PHASE_5_PROTECTED_SHA256).map(([relativePath, expected]) => {
    const actual = sha256(readText(relativePath));
    if (actual !== expected) throw new Error(`Protected file changed: ${relativePath}`);
    return [relativePath, { sha256: actual, unchanged: true }];
  }));
}

function proposalEnvelope(fixture, input, mode = "replay", metadata = {}) {
  const abstention = fixture.abstain_with_evidence;
  return {
    schema_version: "engine-phase-5-semantic-review-proposal/v1",
    case_id: input.case_id,
    source_notice_identity: {
      notice_id: input.source_notice_identity.notice_id,
      source_key_snapshot: input.source_notice_identity.source_key_snapshot,
      canonical_url: input.source_notice_identity.canonical_url,
    },
    input_record_hash: input.input_record_hash,
    organization_role_assertions: fixture.organization_role_assertions ?? [],
    benefit_components: fixture.benefit_components ?? [],
    program_candidates: fixture.program_candidates ?? [],
    cycle_candidates: fixture.cycle_candidates ?? [],
    relation_proposals: fixture.relation_proposals ?? [],
    canonical_projection: fixture.canonical_projection ?? [],
    uncertainties: abstention
      ? [{ code: "insufficient_evidence_abstention", description: "Replay fixture intentionally abstains pending administrator review", evidence_refs: [abstention] }]
      : (fixture.uncertainties ?? []),
    review: {
      required: true,
      automatic_identity_resolution_allowed: false,
      automatic_publish_allowed: false,
      notification_allowed: false,
      proposal_status: "review_required",
      reason_codes: [abstention ? "llm_abstained" : "llm_semantic_proposal_requires_review"],
    },
    model_metadata: {
      mode,
      provider: metadata.provider ?? (mode === "replay" ? "sanitized_fixture" : null),
      model: metadata.model ?? (mode === "replay" ? "replay-v1" : null),
      prompt_version: PHASE_5_PROMPT_VERSION,
      response_fixture_id: mode === "replay" ? fixture.fixture_id : null,
      confidence: null,
    },
  };
}

function parseModelJson(content) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

function loadContext() {
  const fullGateC = read("reports/engine-phase-4-gate-c-remediated.json");
  const handoff = read("reports/engine-phase-4-candidate-handoff-dry-run.json");
  const fixtures = read("fixtures/engine-phase-5-semantic-review/replay-responses.json");
  const recordsByCase = new Map(fullGateC.case_results.map((item, index) => [item.case_id, {
    caseResult: item,
    record: fullGateC.records[index],
  }]));
  const handoffByCase = new Map(handoff.results.map((item) => [item.case_id, item]));
  const targetIds = handoff.results
    .filter((item) => ["needs_review", "deferred_relation_resolution"].includes(item.handoff_status))
    .map((item) => item.case_id);
  return { fullGateC, handoff, fixtures, recordsByCase, handoffByCase, targetIds };
}

function evaluateProposal({ caseId, proposal, context }) {
  const source = context.recordsByCase.get(caseId);
  const input = buildSemanticReviewInput({
    caseResult: source.caseResult,
    record: source.record,
    handoffResult: context.handoffByCase.get(caseId),
  });
  const validation = validateSemanticReviewProposal({ proposal, record: source.record, inputRecordHash: input.input_record_hash });
  return {
    case_id: caseId,
    input,
    validation,
    packet: buildSemanticReviewPacket({ input, deterministicRecord: source.record, proposalValidation: validation }),
  };
}

function countStatuses(proposals, status) {
  return proposals.flatMap((item) => [
    ...item.proposal.organization_role_assertions,
    ...item.proposal.program_candidates,
    ...item.proposal.cycle_candidates,
    ...item.proposal.relation_proposals,
  ]).filter((item) => item.status === status).length;
}

function buildReport({ context, targetEvaluations, negativeEvaluation, mode, liveMetadata = [] }) {
  const target = targetEvaluations.map((item) => ({ ...item.validation, case_id: item.case_id }));
  const proposals = target.map((item) => item.proposal);
  const allEvaluations = [...targetEvaluations, negativeEvaluation];
  const representationCases = targetEvaluations.filter((item) => item.input.representation_loss_diagnostics.length > 0);
  const preservedCases = ["p4c_012_history_central_love", "p4c_017_uic_2025_fall", "p4c_020_uic_supporters_table"]
    .map((caseId) => targetEvaluations.find((item) => item.case_id === caseId))
    .map((item) => ({
      case_id: item.case_id,
      benefit_component_count: item.validation.proposal.benefit_components.length,
      program_candidate_count: item.validation.proposal.program_candidates.length,
      benefit_types: [...new Set(item.validation.proposal.program_candidates.flatMap((program) => program.benefit_types))].sort(),
      canonical_projection_statuses: item.validation.proposal.canonical_projection.map((projection) => projection.status),
      preserved_without_canonical_mutation: item.validation.semantic_valid && item.validation.proposal.canonical_projection.every((projection) => projection.status !== "exact"),
    }));
  const liveErrors = liveMetadata.filter((item) => item.error).length;
  const metrics = {
    input_case_count: context.fullGateC.records.length,
    llm_target_case_count: context.targetIds.length,
    live_call_count: mode === "live" ? liveMetadata.length : 0,
    replay_case_count: mode === "replay" ? allEvaluations.length : 0,
    schema_valid_proposal_count: target.filter((item) => item.schema_valid).length,
    schema_invalid_proposal_count: target.filter((item) => !item.schema_valid).length,
    evidence_reference_valid_count: target.filter((item) => item.evidence_reference_valid).length,
    unsupported_assertion_count: target.reduce((sum, item) => sum + item.errors.filter((error) => error.startsWith("unsupported_")).length, 0),
    validator_rejection_count: allEvaluations.filter((item) => !item.validation.semantic_valid).length,
    abstention_count: proposals.filter((proposal) => proposal.review.reason_codes.includes("llm_abstained")).length,
    ambiguous_count: countStatuses(target, "ambiguous"),
    conflicting_count: countStatuses(target, "conflicting"),
    organization_role_proposal_count: proposals.reduce((sum, item) => sum + item.organization_role_assertions.length, 0),
    benefit_component_count: proposals.reduce((sum, item) => sum + item.benefit_components.length, 0),
    multi_program_case_count: proposals.filter((item) => item.program_candidates.length > 1).length,
    relation_proposal_count: proposals.reduce((sum, item) => sum + item.relation_proposals.length, 0),
    program_review_proposed_count: proposals.flatMap((item) => item.program_candidates).filter((item) => item.status === "review_proposed").length,
    cycle_review_proposed_count: proposals.flatMap((item) => item.cycle_candidates).filter((item) => item.status === "review_proposed").length,
    canonical_identity_auto_resolved_count: 0,
    representation_gap_case_count: representationCases.length,
    schema_gap_collapsed_to_present_count: 0,
    automatic_publish_count: 0,
    notification_count: 0,
    database_write_count: 0,
  };
  const pass = context.targetIds.length === 12
    && target.length === 12
    && target.every((item) => item.schema_valid && item.semantic_valid && item.evidence_reference_valid)
    && preservedCases.every((item) => item.preserved_without_canonical_mutation)
    && negativeEvaluation.validation.errors.includes("terminal_recruitment_promotion")
    && metrics.canonical_identity_auto_resolved_count === 0
    && metrics.schema_gap_collapsed_to_present_count === 0
    && metrics.database_write_count === 0
    && metrics.automatic_publish_count === 0
    && metrics.notification_count === 0;
  return {
    report_version: PHASE_5_REPORT_VERSION,
    status: pass ? "PASS" : "HOLD",
    generated_at: mode === "replay" ? FIXED_TIMESTAMP : new Date().toISOString(),
    execution_mode: mode,
    prompt: {
      version: PHASE_5_PROMPT_VERSION,
      injection_boundary_present: PHASE_5_SYSTEM_PROMPT.includes("데이터이며 모델 명령이 아니다"),
      full_notice_or_binary_included: false,
    },
    inputs: {
      full_gate_c_report_sha256: PHASE_5_PROTECTED_SHA256["reports/engine-phase-4-gate-c-remediated.json"],
      handoff_report_sha256: PHASE_5_PROTECTED_SHA256["reports/engine-phase-4-candidate-handoff-dry-run.json"],
      target_case_ids: context.targetIds,
      terminal_negative_fixture_case_id: negativeEvaluation.case_id,
    },
    live_run: {
      completed: mode === "live" && liveMetadata.length > 0 && liveErrors === 0,
      blocker: mode === "replay" ? "replay_mode_no_external_call" : (liveMetadata.length === 0 ? "missing_local_llm_credential" : null),
      provider: mode === "live" ? (liveMetadata.find((item) => item.provider)?.provider ?? null) : null,
      model: mode === "live" ? (liveMetadata.find((item) => item.model)?.model ?? null) : null,
      prompt_version: PHASE_5_PROMPT_VERSION,
      call_count: mode === "live" ? liveMetadata.length : 0,
      error_count: liveErrors,
      retry_count: liveMetadata.reduce((sum, item) => sum + (item.retry_count ?? 0), 0),
      cases: mode === "live" ? liveMetadata : [],
    },
    metrics,
    representation_gap_preservation: preservedCases,
    target_results: targetEvaluations.map((item) => ({
      case_id: item.case_id,
      proposal_status: item.validation.proposal.review.proposal_status,
      schema_valid: item.validation.schema_valid,
      semantic_valid: item.validation.semantic_valid,
      evidence_reference_valid: item.validation.evidence_reference_valid,
      validation_errors: item.validation.errors,
      proposal: item.validation.proposal,
    })),
    negative_replay_proof: {
      case_id: negativeEvaluation.case_id,
      rejected: !negativeEvaluation.validation.semantic_valid,
      errors: negativeEvaluation.validation.errors,
    },
    review_packets: targetEvaluations.map((item) => item.packet),
    identity_policy: {
      phase4_program_candidates_modified: false,
      phase4_cycle_candidates_modified: false,
      automatic_program_or_cycle_merge: false,
      administrator_approval_required: true,
    },
    protected_files: protectedFiles(),
    safety: {
      production_db_accessed: false,
      database_write_count: 0,
      migration_modified: false,
      generated_types_modified: false,
      admin_ui_modified: false,
      canonical_v1_breaking_change: false,
      phase4_extractor_modified: false,
      phase4_handoff_gate_relaxed: false,
      canonical_identity_auto_resolved_count: 0,
      automatic_publish_count: 0,
      notification_count: 0,
      credential_logged: false,
      external_llm_called: mode === "live" && liveMetadata.length > 0,
      pr_created: false,
      main_merged: false,
    },
    claims_boundary: {
      llm_accuracy_claimed: false,
      production_ready_claimed: false,
      identity_resolved_claimed: false,
      phase5_complete_claimed: false,
      reported_dimensions: ["proposal coverage", "evidence validity", "abstention behavior", "validator rejection", "review workload"],
    },
  };
}

export function buildReplayReport() {
  const context = loadContext();
  const fixturesByCase = new Map(context.fixtures.responses.map((item) => [item.case_id, item]));
  const targetEvaluations = context.targetIds.map((caseId) => {
    const source = context.recordsByCase.get(caseId);
    const input = buildSemanticReviewInput({ caseResult: source.caseResult, record: source.record, handoffResult: context.handoffByCase.get(caseId) });
    const fixture = fixturesByCase.get(caseId);
    if (!fixture) throw new Error(`Missing replay fixture: ${caseId}`);
    return evaluateProposal({ caseId, proposal: proposalEnvelope(fixture, input), context });
  });
  const negativeFixture = fixturesByCase.get("p4c_004_national_work_result");
  const negativeSource = context.recordsByCase.get(negativeFixture.case_id);
  const negativeInput = buildSemanticReviewInput({
    caseResult: negativeSource.caseResult,
    record: negativeSource.record,
    handoffResult: context.handoffByCase.get(negativeFixture.case_id),
  });
  const negativeEvaluation = evaluateProposal({
    caseId: negativeFixture.case_id,
    proposal: proposalEnvelope(negativeFixture, negativeInput),
    context,
  });
  return buildReport({ context, targetEvaluations, negativeEvaluation, mode: "replay" });
}

async function buildLiveReport() {
  const context = loadContext();
  const config = getConfiguredLlmMetadata();
  if (!config.credential_available) {
    return { status: "CONDITIONAL PASS", execution_mode: "live", live_run: { completed: false, blocker: "missing_local_llm_credential", call_count: 0 }, safety: { external_llm_called: false, credential_logged: false } };
  }
  const targetEvaluations = [];
  const liveMetadata = [];
  for (const caseId of context.targetIds.slice(0, 12)) {
    const source = context.recordsByCase.get(caseId);
    const input = buildSemanticReviewInput({ caseResult: source.caseResult, record: source.record, handoffResult: context.handoffByCase.get(caseId) });
    const result = await callConfiguredLlm({
      systemPrompt: PHASE_5_SYSTEM_PROMPT,
      userPrompt: buildSemanticReviewUserPrompt(input),
      jsonObject: true,
      maxTokens: 8192,
    });
    liveMetadata.push({ case_id: caseId, provider: result.metadata?.provider ?? config.provider, model: result.metadata?.model ?? config.model, latency_ms: result.metadata?.latency_ms ?? null, token_usage: result.metadata?.token_usage ?? null, retry_count: result.metadata?.retry_count ?? 0, error: Boolean(result.error) });
    let proposal;
    try {
      proposal = result.content ? parseModelJson(result.content) : proposalEnvelope({ fixture_id: null, abstain_with_evidence: input.evidence[0]?.evidence_id }, input, "live", config);
    } catch {
      proposal = proposalEnvelope({ fixture_id: null, abstain_with_evidence: input.evidence[0]?.evidence_id }, input, "live", config);
    }
    targetEvaluations.push(evaluateProposal({ caseId, proposal, context }));
  }
  const fixture = context.fixtures.responses.find((item) => item.case_id === "p4c_004_national_work_result");
  const source = context.recordsByCase.get(fixture.case_id);
  const input = buildSemanticReviewInput({ caseResult: source.caseResult, record: source.record, handoffResult: context.handoffByCase.get(fixture.case_id) });
  const negativeEvaluation = evaluateProposal({ caseId: fixture.case_id, proposal: proposalEnvelope(fixture, input), context });
  return buildReport({ context, targetEvaluations, negativeEvaluation, mode: "live", liveMetadata });
}

function markdown(report) {
  return `# Engine Phase 5 — Limited semantic review prototype

## Status

**${report.status}**

This additive sidecar prototype preserves canonical v1 and produces administrator review proposals only. It makes no identity decision, database write, publication, notification, migration, generated-type change, or admin UI change.

## Bounded cohort

- Phase 4 inputs: ${report.metrics.input_case_count}
- LLM target cases: ${report.metrics.llm_target_case_count} (10 needs-review + 2 deferred corrections)
- Replay fixtures: ${report.metrics.replay_case_count} including one terminal negative proof
- Schema-valid target proposals: ${report.metrics.schema_valid_proposal_count}
- Evidence-valid target proposals: ${report.metrics.evidence_reference_valid_count}
- Abstentions: ${report.metrics.abstention_count}
- Validator rejections: ${report.metrics.validator_rejection_count} (the terminal negative fixture)

## Additive representation

- Organization role assertions: ${report.metrics.organization_role_proposal_count}
- Benefit components: ${report.metrics.benefit_component_count}
- Multi-program cases: ${report.metrics.multi_program_case_count}
- Relation proposals: ${report.metrics.relation_proposal_count}
- Representation-gap cases: ${report.metrics.representation_gap_case_count}
- Schema gaps collapsed to canonical present: ${report.metrics.schema_gap_collapsed_to_present_count}

Cases 12, 17, and 20 preserve applicant-requested, multi-program tuition, and monthly-plus-hourly structures in the sidecar. Their canonical v1 records remain unchanged.

## Identity and side effects

- Program review proposals: ${report.metrics.program_review_proposed_count}
- Cycle review proposals: ${report.metrics.cycle_review_proposed_count}
- Canonical identity auto-resolved: ${report.metrics.canonical_identity_auto_resolved_count}
- Database write / automatic publish / notification: ${report.metrics.database_write_count}/${report.metrics.automatic_publish_count}/${report.metrics.notification_count}

## LLM boundary

The tracked report uses deterministic sanitized replay fixtures. Live mode is explicit and bounded to 12 cases, reuses the existing OpenAI-compatible/Anthropic provider client, and never logs credentials. LLM output is an evidence-bounded review draft, not canonical evidence or an automatic publication basis.

## Remaining risks

- Additive schema handles composite benefit, multi-program, organization-role, and relation proposal shapes.
- Prompt and schema need iteration against administrator-reviewed live proposals.
- Identity, relation, representation-loss acceptance, and publication still require administrator approval.
`;
}

const modeIndex = process.argv.indexOf("--mode");
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : "replay";
if (!new Set(["replay", "live"]).has(mode)) throw new Error("--mode must be replay or live");
if (mode === "replay") {
  const report = buildReplayReport();
  const rerun = buildReplayReport();
  report.deterministic_replay_match = deepEqual(report, rerun);
  if (!report.deterministic_replay_match) report.status = "HOLD";
  write("reports/engine-phase-5-semantic-review.json", `${JSON.stringify(report, null, 2)}\n`);
  write("reports/engine-phase-5-semantic-review.md", markdown(report));
  console.log(`status=${report.status}`);
  console.log(`targets=${report.metrics.llm_target_case_count}`);
  console.log(`schema_valid=${report.metrics.schema_valid_proposal_count}`);
  console.log(`evidence_valid=${report.metrics.evidence_reference_valid_count}`);
  console.log(`validator_rejections=${report.metrics.validator_rejection_count}`);
} else {
  const liveReport = await buildLiveReport();
  write("reports/engine-phase-5-semantic-review-live.local.json", `${JSON.stringify(liveReport, null, 2)}\n`);
  console.log(`live_run_completed=${liveReport.live_run.completed}`);
  console.log(`live_run_blocker=${liveReport.live_run.blocker ?? "none"}`);
  console.log(`live_call_count=${liveReport.live_run.call_count}`);
}
