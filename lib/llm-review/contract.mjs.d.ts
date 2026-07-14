import type { ReviewEvidence } from "./contract";
export const REVIEW_PROMPT_VERSION: string;
export function validateReviewAssistance(value: unknown, evidence: ReviewEvidence[]): string[];
