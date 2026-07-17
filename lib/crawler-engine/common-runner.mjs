import { resolveExactSourceKey } from "../post-phase-l/source-resolver.mjs";

export const CRAWLER_RESULT_STATUSES = Object.freeze([
  "success",
  "empty_observed",
  "network_error",
  "http_error",
  "parser_error",
  "configuration_error",
  "source_resolution_error",
  "unsupported",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function configurationError(source, reason) {
  return {
    source_key: clean(source?.sourceKey ?? source?.sourceId),
    source_id: null,
    result_status: "configuration_error",
    observed_count: 0,
    matched_count: 0,
    error_code: reason,
    error_message: reason,
    notices: [],
  };
}

export function validateCommonCrawlerSource(source) {
  const sourceKey = clean(source?.sourceKey ?? source?.sourceId);
  if (!sourceKey) return "missing_source_key";
  if (!clean(source?.sourceName)) return "missing_source_name";
  try {
    const listUrl = new URL(clean(source?.listUrl));
    if (!["http:", "https:"].includes(listUrl.protocol)) return "unsupported_list_url_protocol";
  } catch {
    return "invalid_list_url";
  }
  return "";
}

export function classifyCrawlerFailure(error, fallback = "network_error") {
  if (error?.crawlerStatus && CRAWLER_RESULT_STATUSES.includes(error.crawlerStatus)) {
    return error.crawlerStatus;
  }
  if (Number.isFinite(Number(error?.httpStatus))) return "http_error";
  return fallback;
}

function failureResult(sourceKey, sourceId, status, error) {
  const message = clean(error?.message ?? error) || status;
  return {
    source_key: sourceKey,
    source_id: sourceId,
    result_status: status,
    observed_count: 0,
    matched_count: 0,
    error_code: clean(error?.code) || status,
    error_message: message,
    notices: [],
  };
}

function responseHtml(response) {
  return typeof response === "string" ? response : String(response?.html ?? "");
}

export async function runCommonCrawlerSource({
  source,
  inventoryRows,
  strategy,
  fetchHtml,
  listUrls,
  maxItems = 20,
  fetchDetails = true,
  beforeDetail,
}) {
  const invalidReason = validateCommonCrawlerSource(source);
  if (invalidReason) return configurationError(source, invalidReason);

  const sourceKey = clean(source.sourceKey ?? source.sourceId);
  const resolution = resolveExactSourceKey(sourceKey, inventoryRows);
  if (resolution.blocked) {
    return failureResult(sourceKey, null, "source_resolution_error", {
      code: resolution.reason,
      message: resolution.reason,
    });
  }

  const sourceId = resolution.source_id;
  if (!strategy || typeof strategy.parseList !== "function") {
    return failureResult(sourceKey, sourceId, "unsupported", {
      code: "missing_supported_strategy",
      message: "No supported crawler strategy is configured.",
    });
  }
  if (typeof fetchHtml !== "function") {
    return configurationError(source, "missing_fetch_html_transport");
  }

  const boundedLimit = Math.max(1, Number(maxItems) || 1);
  const urls = Array.isArray(listUrls) && listUrls.length > 0 ? listUrls : [source.listUrl];
  const items = [];
  const seen = new Set();

  for (const listUrl of urls) {
    let html;
    try {
      const request = strategy.buildListRequest
        ? strategy.buildListRequest({ source, listUrl })
        : { url: listUrl };
      html = responseHtml(await fetchHtml(request.url, request));
    } catch (error) {
      return failureResult(
        sourceKey,
        sourceId,
        classifyCrawlerFailure(error, "network_error"),
        error,
      );
    }

    let parsed;
    try {
      parsed = await strategy.parseList({ source: { ...source, listUrl }, html });
      if (!Array.isArray(parsed)) throw new Error("Strategy parseList must return an array.");
    } catch (error) {
      return failureResult(sourceKey, sourceId, "parser_error", error);
    }

    for (const item of parsed) {
      const detailUrl = strategy.resolveDetailUrl
        ? strategy.resolveDetailUrl({ source, item })
        : item.noticeUrl;
      if (!detailUrl || seen.has(detailUrl)) continue;
      seen.add(detailUrl);
      items.push({ ...item, noticeUrl: detailUrl });
      if (items.length >= boundedLimit) break;
    }
    if (items.length >= boundedLimit) break;
  }

  const notices = [];
  for (const item of items) {
    let detail = {};
    if (fetchDetails && item.noticeUrl) {
      try {
        if (beforeDetail) await beforeDetail({ source, item });
        const request = strategy.buildDetailRequest
          ? strategy.buildDetailRequest({ source, item })
          : { url: item.noticeUrl };
        const html = responseHtml(await fetchHtml(request.url, request));
        detail = strategy.parseDetail
          ? await strategy.parseDetail({ source, item, html })
          : {};
      } catch (error) {
        detail = {
          detailFetchError: clean(error?.message ?? error),
          detailResultStatus: classifyCrawlerFailure(error, "network_error"),
        };
      }
    }
    const attachmentMetadata = strategy.extractAttachmentMetadata
      ? strategy.extractAttachmentMetadata({ source, item, detail })
      : detail.attachmentMetadata ?? [];
    const notice = strategy.normalizeNotice
      ? strategy.normalizeNotice({ source, sourceId, item, detail, attachmentMetadata })
      : { ...item, ...detail, attachmentMetadata };
    notices.push(notice);
  }

  return {
    source_key: sourceKey,
    source_id: sourceId,
    source_name: clean(source.sourceName),
    strategy: strategy.name ?? "unknown",
    result_status: notices.length > 0 ? "success" : "empty_observed",
    observed_count: notices.length,
    matched_count: notices.length,
    notices,
  };
}

export async function runCommonCrawler({
  sources,
  inventoryRows,
  strategyResolver,
  fetchHtml,
  run = {},
  options = {},
}) {
  const sourceResults = [];
  for (const source of sources ?? []) {
    const strategy = strategyResolver?.(source) ?? null;
    sourceResults.push(
      await runCommonCrawlerSource({
        source,
        inventoryRows,
        strategy,
        fetchHtml,
        listUrls: options.listUrls?.(source),
        maxItems: options.maxItems,
        fetchDetails: options.fetchDetails,
        beforeDetail: options.beforeDetail,
      }),
    );
  }
  return {
    run: {
      idempotency_key: clean(run.idempotency_key) || "engine-phase-1-common-crawler",
      execution_mode: clean(run.execution_mode) || "fixture",
      runner_version: clean(run.runner_version) || "engine-phase-1-common-runner-v1",
      status: sourceResults.every((result) => ["success", "empty_observed"].includes(result.result_status))
        ? "succeeded"
        : "degraded",
      started_at: run.started_at,
      finished_at: run.finished_at,
      metadata: run.metadata ?? {},
    },
    source_results: sourceResults,
  };
}
