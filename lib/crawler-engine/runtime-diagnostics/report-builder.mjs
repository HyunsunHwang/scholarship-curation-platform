import {
  attachmentMetadataToCsvCell,
  imageUrlsToCsvCell,
} from "../../notice-body-extraction.mjs";

export const CRAWLER_NOTICE_CSV_COLUMNS = Object.freeze([
  "run_at", "source_id", "university_slug", "university_id", "college_id", "department_id",
  "college_name", "department_name", "source_level", "source_name", "title", "notice_url",
  "date_text", "detail_date", "parsed_date", "content", "image_urls", "attachment_metadata",
]);

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function escapeCrawlerNoticeCsvCell(value) {
  const text = cleanText(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCrawlerNoticeCsv({ runAt, notices = [] } = {}) {
  const rows = Array.isArray(notices) ? notices : [];
  const lines = [
    CRAWLER_NOTICE_CSV_COLUMNS.join(","),
    ...rows.map((row) => [
      runAt, row.sourceId, row.universitySlug ?? "", row.universityId ?? "", row.collegeId ?? "",
      row.departmentId ?? "", row.collegeName ?? "", row.departmentName ?? "", row.sourceLevel ?? "",
      row.sourceName, row.title, row.noticeUrl, row.dateText ?? "", row.detailDate ?? "",
      row.parsedDate ?? "", row.content ?? "", imageUrlsToCsvCell(row.imageUrls),
      attachmentMetadataToCsvCell(row.attachmentMetadata),
    ].map(escapeCrawlerNoticeCsvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function buildCrawlerReport(input = {}) {
  const crawled = Array.isArray(input.crawled) ? input.crawled : [];
  const allMatched = Array.isArray(input.allMatched) ? input.allMatched : [];
  const executionResults = Array.isArray(input.executionResults) ? input.executionResults : [];
  const summarizeDocumentEvidence = input.summarizeDocumentEvidence ?? (() => null);
  const sourceExecutionEvidence = executionResults.map(({ notices, ...evidence }) => evidence);
  return {
    runAt: input.runAt,
    input: input.inputLabel,
    sourceMode: input.sourceMode,
    safety: {
      databaseReadPerformed: input.databaseReadPerformed === true,
      databaseWritePerformed: false,
      productionAccessPerformed: false,
      externalLlmCallCount: 0,
    },
    totals: input.totals ?? {},
    boundedExecution: {
      summary: input.executionSummary,
      sources: sourceExecutionEvidence,
    },
    recovery: input.recovery ?? null,
    perSource: input.stats ?? [],
    observedItems: crawled.map((item) => ({
      sourceId: item.sourceId,
      title: item.title,
      noticeUrl: item.noticeUrl,
      listUrl: item.listUrl,
      dateText: item.dateText ?? "",
      detailDate: item.detailDate ?? "",
      parsedDate: item.parsedDate ?? "",
      detailFetchError: item.detailFetchError ?? "",
      detailResultStatus: item.detailResultStatus ?? null,
      detailTransportErrorCode: item.detailTransportErrorCode ?? null,
      detailTransportErrorCategory: item.detailTransportErrorCategory ?? null,
      detailTransportErrorRetryable: typeof item.detailTransportErrorRetryable === "boolean"
        ? item.detailTransportErrorRetryable
        : null,
      contentExcerpt: cleanText(item.content ?? "").slice(0, 500),
      qualitySignals: item.qualitySignals ?? null,
      documentEvidence: input.documentParsingEnabled ? summarizeDocumentEvidence(item) : null,
      matched: allMatched.some((matchedItem) =>
        matchedItem.sourceId === item.sourceId && matchedItem.noticeUrl === item.noticeUrl),
    })),
    newNotices: input.allNew ?? [],
  };
}
