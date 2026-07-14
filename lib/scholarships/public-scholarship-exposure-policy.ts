export type ScholarshipExposureStatus =
  | "public"
  | "hidden_unresolved_source"
  | "hidden_review_required"
  | "hidden_blocked"
  | "hidden_duplicate_risk"
  | "hidden_quality_risk"
  | "hidden_missing_evidence";

export type PublicExposureInput = {
  sourceResolutionStatus: string;
  reviewStatus: string;
  blockerStatus: string | null;
  duplicateStatus: string;
  qualityStatus: string;
  bodyQuality: string;
  imageOnlySuspected: boolean;
  adminReviewRequired: boolean;
  sourceResultStatus: string;
  zeroMatchObserved: boolean;
  observabilityStatus: string;
  parserRiskCodes: string[];
  title: string;
  originalUrl: string;
  publishedAt: string;
  bodyText: string;
};

const MINIMUM_BODY_LENGTH = 80;

export function evaluatePublicScholarshipExposure(
  input: PublicExposureInput,
): ScholarshipExposureStatus {
  if (input.sourceResolutionStatus !== "resolved") {
    return "hidden_unresolved_source";
  }

  if (input.reviewStatus === "blocked" || input.blockerStatus) {
    return "hidden_blocked";
  }

  if (input.reviewStatus !== "clean" || input.adminReviewRequired) {
    return "hidden_review_required";
  }

  if (input.duplicateStatus !== "unique") {
    return "hidden_duplicate_risk";
  }

  if (
    input.qualityStatus !== "accepted" ||
    input.bodyQuality.includes("review") ||
    input.imageOnlySuspected ||
    input.parserRiskCodes.length > 0 ||
    input.sourceResultStatus !== "success" ||
    input.zeroMatchObserved ||
    input.observabilityStatus !== "healthy"
  ) {
    return "hidden_quality_risk";
  }

  if (
    !input.title.trim() ||
    !input.originalUrl.trim() ||
    !input.publishedAt.trim() ||
    input.bodyText.trim().length < MINIMUM_BODY_LENGTH
  ) {
    return "hidden_missing_evidence";
  }

  return "public";
}
