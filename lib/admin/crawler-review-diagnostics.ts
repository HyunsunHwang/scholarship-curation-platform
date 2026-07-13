import diagnosticsReport from "@/reports/post-phase-f1-admin-review-integration.json";

export type AdminCrawlerReviewDiagnostic = {
  id: string;
  sourceId?: string;
  sourceKey?: string;
  title: string;
  sourceResolutionStatus: string;
  sourceResolutionReason: string;
  reviewStatus: string;
  qualityStatus: string;
  qualityFlags: string[];
  zeroMatchObserved: boolean;
  falseNegativeReview: boolean;
  parserFailureReasonCodes: string[];
  itemReadabilityStatus: string;
  boardReadabilityStatus: string | null;
  remediationPriority: "P0" | "P1" | "P2" | "P3" | null;
  f2RemediationStatus: "resolved" | "deferred" | null;
  f2ClassificationBefore: string | null;
  f2ClassificationAfter: string | null;
  f2NextAction: string | null;
  nextAction: string;
  batchWarning: string | null;
  batchStatus: string;
  sourceResultStatus: string;
  rollbackScopeAvailable: boolean;
  adminReviewRequired: boolean;
  autoApplyAllowed: boolean;
};

export type AdminCrawlerReviewFilter =
  | "all"
  | "clean"
  | "needs-review"
  | "blocked"
  | "zero-match"
  | "parser-readability"
  | "p0-p1";

type DiagnosticsReport = Omit<typeof diagnosticsReport, "diagnostics"> & {
  diagnostics: AdminCrawlerReviewDiagnostic[];
};

const report = diagnosticsReport as DiagnosticsReport;

export function getAdminCrawlerReviewDiagnostics() {
  return report;
}

export function filterAdminCrawlerReviewDiagnostics(
  diagnostics: AdminCrawlerReviewDiagnostic[],
  filter: AdminCrawlerReviewFilter
) {
  switch (filter) {
    case "clean":
      return diagnostics.filter((item) => item.reviewStatus === "clean");
    case "needs-review":
      return diagnostics.filter((item) => item.adminReviewRequired && item.reviewStatus !== "blocked");
    case "blocked":
      return diagnostics.filter((item) => item.reviewStatus === "blocked");
    case "zero-match":
      return diagnostics.filter((item) => item.zeroMatchObserved);
    case "parser-readability":
      return diagnostics.filter((item) => item.parserFailureReasonCodes.length > 0);
    case "p0-p1":
      return diagnostics.filter((item) => item.remediationPriority === "P0" || item.remediationPriority === "P1");
    default:
      return diagnostics;
  }
}

export function parseAdminCrawlerReviewFilter(value: string | undefined): AdminCrawlerReviewFilter {
  const filters: AdminCrawlerReviewFilter[] = ["all", "clean", "needs-review", "blocked", "zero-match", "parser-readability", "p0-p1"];
  return filters.includes(value as AdminCrawlerReviewFilter) ? (value as AdminCrawlerReviewFilter) : "all";
}
