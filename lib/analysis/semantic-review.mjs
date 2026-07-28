import { createHash, randomUUID } from "node:crypto";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export const SEMANTIC_REVIEW_DECISIONS = Object.freeze([
  "approve",
  "reject",
  "needs_revision",
  "reanalysis_requested",
]);

export function buildSemanticReviewEvent({
  result,
  reviewerId,
  decision,
  correctedOutput = null,
  reason = null,
  now = new Date().toISOString(),
}) {
  if (!result?.id || !reviewerId) throw new Error("result_and_reviewer_required");
  if (!SEMANTIC_REVIEW_DECISIONS.includes(decision)) throw new Error("invalid_review_decision");
  if (decision === "approve" && !correctedOutput && !result.structured_result) {
    throw new Error("approved_output_required");
  }
  const effectiveOutput = correctedOutput ?? result.structured_result ?? null;
  return {
    id: randomUUID(),
    result_id: result.id,
    notice_id: result.notice_id,
    revision_id: result.revision_id,
    reviewer_id: reviewerId,
    decision,
    original_result_fingerprint: result.result_fingerprint,
    corrected_output: correctedOutput,
    effective_output: effectiveOutput,
    correction_fingerprint: correctedOutput ? fingerprint(correctedOutput) : null,
    reason,
    reviewed_at: now,
    created_at: now,
  };
}

export function buildGoldDatasetRows({
  results = [],
  runs = [],
  evidence = [],
  reviews = [],
  safeInputs = [],
}) {
  const runById = new Map(runs.map((row) => [row.id, row]));
  const inputByFingerprint = new Map(
    safeInputs.map((row) => [row.input_fingerprint, row]),
  );
  return reviews
    .filter((review) => ["approve", "reject"].includes(review.decision))
    .map((review) => {
      const result = results.find((row) => row.id === review.result_id);
      if (!result) throw new Error(`gold_export_missing_result:${review.result_id}`);
      const run = runById.get(result.run_id);
      if (!run) throw new Error(`gold_export_missing_run:${result.run_id}`);
      return {
        notice_id: result.notice_id,
        revision_id: result.revision_id,
        input_fingerprint: run.input_fingerprint,
        safe_analysis_input: inputByFingerprint.get(run.input_fingerprint)?.normalized_input ?? null,
        prompt_version: run.prompt_version,
        schema_version: run.schema_version,
        provider: run.provider,
        model: run.model,
        raw_model_structured_output: result.structured_result,
        validated_output: result.structured_result,
        admin_corrected_output: review.corrected_output,
        effective_gold_output: review.effective_output,
        evidence: evidence
          .filter((entry) => entry.result_id === result.id)
          .sort((a, b) => `${a.field_path}|${a.evidence_fingerprint}`
            .localeCompare(`${b.field_path}|${b.evidence_fingerprint}`)),
        review_decision: review.decision,
        review_reason: review.reason,
        reviewer_id: review.reviewer_id,
        reviewed_at: review.reviewed_at,
        validation_errors: result.validation_errors,
      };
    })
    .sort((a, b) => `${a.revision_id}|${a.reviewed_at}`.localeCompare(
      `${b.revision_id}|${b.reviewed_at}`,
    ));
}
