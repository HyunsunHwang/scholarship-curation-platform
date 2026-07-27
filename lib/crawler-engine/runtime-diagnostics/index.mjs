export {
  CRAWLER_RESULT_STATUSES,
  analyzeRuntimeCrawlFailures,
  classifyCrawlerFailure,
  classifyTransportErrorCode,
  extractSafeCrawlerErrorEvidence,
  isContentContractErrorCode,
  isPartialCrawlerResult,
  isRetryableTransportErrorCode,
  isSuccessfulCrawlerResult,
  isZeroMatchCrawlerResult,
  normalizeTransportErrorCode,
  sanitizeCrawlerError,
} from "./failure-analyzer.mjs";

export {
  buildCrawlerRunSummary,
  deterministicCrawlerProjection,
  validateCrawlerRunSummary,
} from "./run-summary.mjs";

export {
  CRAWLER_NOTICE_CSV_COLUMNS,
  buildCrawlerNoticeCsv,
  buildCrawlerReport,
  escapeCrawlerNoticeCsvCell,
} from "./report-builder.mjs";

export {
  OPERATIONAL_ACCESS_PROFILES,
  OPERATIONAL_CAPABILITY_STATUSES,
  OPERATIONAL_CRAWL_CODES,
  OPERATIONAL_CRAWL_DIAGNOSTIC_CSV_COLUMNS,
  OPERATIONAL_CRAWL_STAGES,
  OPERATIONAL_STAGE_STATUSES,
  PHASE2_ANALYSIS_CODES,
  PHASE2_CANDIDATE_RECALL_STATUSES,
  PHASE2_DETAIL_IDENTITY_STATUSES,
  PHASE2_LIST_PARSER_CONTRACT_STATUSES,
  PHASE2_PAGINATION_STATUSES,
  PHASE2_REMEDIATION_STATUSES,
  PHASE2_RUNTIME_ACCESSIBILITY_STATUSES,
  analyzeOperationalCrawlerSource,
  analyzePhase2ParserRemediation,
  buildOperationalCrawlDiagnostics,
  buildOperationalCrawlDiagnosticsCsv,
  validateOperationalCrawlDiagnostics,
} from "./operational-crawl-failure-analyzer.mjs";

export { buildPhase2CandidateComparison } from "./phase2-candidate-comparison.mjs";
export { buildPhase2SameHtmlComparison } from "./phase2-same-html-comparison.mjs";

export { CONTENT_TOPOLOGY_PROFILES } from "../operational-parser-evidence.mjs";

export {
  normalizeOperationalTitleForIdentity,
  stripOperationalNoticePrefix,
  verifyOperationalDetailTitleIdentity,
} from "./operational-title-identity.mjs";

export {
  CANDIDATE_DETECTION_STATUSES,
  buildCandidateDetectionDiagnostics,
} from "../candidate-detection-diagnostics.mjs";
