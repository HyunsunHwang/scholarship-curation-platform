export {
  CRAWLER_RESULT_STATUSES,
  analyzeRuntimeCrawlFailures,
  classifyCrawlerFailure,
  classifyTransportErrorCode,
  extractSafeCrawlerErrorEvidence,
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
  OPERATIONAL_CRAWL_CODES,
  OPERATIONAL_CRAWL_DIAGNOSTIC_CSV_COLUMNS,
  OPERATIONAL_CRAWL_STAGES,
  analyzeOperationalCrawlerSource,
  buildOperationalCrawlDiagnostics,
  buildOperationalCrawlDiagnosticsCsv,
  validateOperationalCrawlDiagnostics,
} from "./operational-crawl-failure-analyzer.mjs";

export {
  normalizeOperationalTitleForIdentity,
  stripOperationalNoticePrefix,
  verifyOperationalDetailTitleIdentity,
} from "./operational-title-identity.mjs";
