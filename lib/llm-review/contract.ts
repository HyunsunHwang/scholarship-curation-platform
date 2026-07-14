export const REVIEW_PROMPT_VERSION = "post-phase-i-evidence-only/v1";

export type ReviewEvidence = {
  evidenceId: string;
  type: "title" | "published_at" | "body_excerpt" | "attachment_metadata" | "source_identity" | "detail_url" | "parser_warning" | "quality_warning";
  text?: string;
  url?: string;
  sourcePath?: string;
  verified: boolean;
  limitation?: string;
};

export type SuggestedValue = {
  value: string;
  confidence: number;
  evidenceIds: string[];
  extractionMode: "quoted" | "inferred";
};

export type LlmReviewAssistance = {
  itemId: string;
  sourceId?: string;
  sourceKey?: string;
  scholarshipLikelihood: { decision: "likely" | "uncertain" | "unlikely"; confidence: number; evidenceIds: string[]; rationale: string };
  suggestedFields: Partial<Record<"title" | "organization" | "publishedAt" | "deadline" | "eligibility" | "benefit" | "applicationMethod", SuggestedValue>>;
  detectedRisks: Array<{ code: string; severity: "high" | "medium" | "low"; evidenceIds: string[]; explanation: string }>;
  missingEvidence: string[];
  contradictions: string[];
  recommendation: "review_supported" | "manual_review_required" | "insufficient_evidence" | "parser_fix_required" | "attachment_check_required";
  humanDecisionRequired: true;
  autoApproveAllowed: false;
  autoRejectAllowed: false;
  publicExposureAllowed: false;
  providerMetadata: { provider: "deterministic_replay"; model: "fixture"; promptVersion: string; generatedAt: string };
};

export type ReviewAssistantProvider = {
  analyze(input: { itemId: string; evidence: ReviewEvidence[] }): Promise<LlmReviewAssistance>;
};

const fieldNames = new Set(["title", "organization", "publishedAt", "deadline", "eligibility", "benefit", "applicationMethod"]);

export function validateReviewAssistance(value: unknown, evidence: ReviewEvidence[]): string[] {
  if (!value || typeof value !== "object") return ["response_not_object"];
  const output = value as Partial<LlmReviewAssistance>;
  const evidenceIds = new Set(evidence.map((item) => item.evidenceId));
  const errors: string[] = [];
  if (!output.itemId || !output.scholarshipLikelihood || !output.recommendation) errors.push("required_fields_missing");
  if (output.humanDecisionRequired !== true || output.autoApproveAllowed !== false || output.autoRejectAllowed !== false || output.publicExposureAllowed !== false) errors.push("automatic_decision_boundary_invalid");
  for (const [name, suggestion] of Object.entries(output.suggestedFields ?? {})) {
    if (!fieldNames.has(name) || !suggestion || typeof suggestion !== "object") { errors.push("suggested_field_invalid"); continue; }
    const item = suggestion as SuggestedValue;
    if (!item.value || !["quoted", "inferred"].includes(item.extractionMode) || !Array.isArray(item.evidenceIds) || item.evidenceIds.length === 0 || item.evidenceIds.some((id) => !evidenceIds.has(id))) errors.push(`suggestion_evidence_invalid:${name}`);
  }
  for (const risk of output.detectedRisks ?? []) if (!Array.isArray(risk.evidenceIds) || risk.evidenceIds.some((id) => !evidenceIds.has(id))) errors.push("risk_evidence_invalid");
  if (output.scholarshipLikelihood && (!Array.isArray(output.scholarshipLikelihood.evidenceIds) || output.scholarshipLikelihood.evidenceIds.some((id) => !evidenceIds.has(id)))) errors.push("likelihood_evidence_invalid");
  return errors;
}
