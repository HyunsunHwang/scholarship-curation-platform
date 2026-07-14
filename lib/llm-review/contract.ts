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

// The Node replay path owns runtime validation. Keep this TypeScript entry
// point as a typed delegation so application and script behavior cannot drift.
export { validateReviewAssistance } from "./contract.mjs";
