import {
  classifyCrawlerFailure,
  extractSafeCrawlerErrorEvidence,
  sanitizeCrawlerError,
} from "./runtime-diagnostics/index.mjs";

export function buildSafeSourceWorkerError(error) {
  return {
    status: classifyCrawlerFailure(error, "network_error"),
    error_code: String(error?.code ?? "").trim() || "network_error",
    error_message: sanitizeCrawlerError(error) || "network_error",
    ...extractSafeCrawlerErrorEvidence(error),
  };
}
