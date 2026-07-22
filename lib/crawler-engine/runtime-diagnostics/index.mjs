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
