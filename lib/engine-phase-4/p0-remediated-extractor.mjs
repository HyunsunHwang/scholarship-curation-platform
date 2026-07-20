import { sha256, stableUuid } from "../post-phase-l/normalized-graph.mjs";
import {
  extractDateCandidates,
  extractExplicitValue,
  normalizeWhitespace,
} from "./deterministic-normalizers.mjs";
import {
  FIELD_REVIEW_POLICY,
  P0_REMEDIATION_SCHEMA_VERSION,
} from "./p0-remediation-contract.mjs";

export const P0_REMEDIATED_EXTRACTOR_NAME = "engine-phase-4-p0-remediated-deterministic";
export const P0_REMEDIATED_EXTRACTOR_VERSION = "1.1.0";

const DOCUMENT_FAILURE_STATUSES = new Set([
  "ocr_low_quality",
  "ocr_not_evaluated",
  "tool_unavailable",
  "unsupported_format",
  "parser_failed",
  "download_failed",
  "encrypted_or_protected",
  "bounded_limit_exceeded",
  "manual_review_required",
  "partial",
  "partial_text",
  "insufficient",
  "low_quality",
  "empty",
  "missing_body",
  "short_body_needs_review",
  "image_only_suspected",
  "attachment_required_unknown",
]);
const SAFE_TEXT_STATUSES = new Set([
  "text_sufficient",
  "success",
  "safe",
  "normalized",
  "clean",
  "good_text",
  "no_assets_but_text_sufficient",
  "text_sufficient_no_assets",
]);
const RECOGNIZED_DOCUMENT_FORMATS = new Set(["pdf", "hwp", "hwpx", "image", "html"]);
const TERMINAL_DOCUMENT_KINDS = new Set(["result_announcement", "information_session", "general_guidance"]);
const MONTHS = Object.freeze({
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
});

function assertInput(sourceNotice, extractionContext) {
  if (!sourceNotice?.notice_id) throw new TypeError("sourceNotice.notice_id is required");
  if (!sourceNotice?.title) throw new TypeError("sourceNotice.title is required");
  if (!/^https?:\/\//u.test(sourceNotice?.canonical_url ?? "")) throw new TypeError("sourceNotice.canonical_url must be HTTP(S)");
  const asOf = extractionContext?.asOf ?? extractionContext?.extractedAt;
  if (!asOf || !Number.isFinite(Date.parse(asOf))) throw new TypeError("extractionContext.asOf or extractedAt must be an injected ISO timestamp");
}

function normalizeDocument(document) {
  const documentId = String(document?.document_id ?? "").trim();
  const documentHash = String(document?.document_hash ?? document?.byte_sha256 ?? "").trim();
  const rawFormat = String(document?.detected_format ?? document?.media_type ?? "").toLowerCase();
  const format = rawFormat.includes("pdf") ? "pdf"
    : rawFormat.includes("hwpx") ? "hwpx"
      : rawFormat.includes("hwp") ? "hwp"
        : rawFormat.includes("image") || /(?:png|jpe?g|gif|webp|tiff)/u.test(rawFormat) ? "image"
          : rawFormat.includes("html") ? "html"
            : null;
  return {
    ...document,
    document_id: documentId || null,
    document_hash: /^[a-f0-9]{64}$/u.test(documentHash) ? documentHash : null,
    document_revision_id: String(document?.document_revision_id ?? "").trim()
      || (documentId && documentHash ? stableUuid("p0_remediated_document_revision", `${documentId}|${documentHash}`) : null),
    format,
    extraction_status: String(document?.extraction_status ?? "").trim().toLowerCase() || null,
    quality_status: String(document?.quality_status ?? "").trim().toLowerCase() || null,
  };
}

function sourceType(document, block = {}) {
  if (block.type === "table") return "table_text";
  if (document.format === "pdf") return document.ocr_used || block.type === "ocr_text" ? "ocr_text" : "pdf_text";
  if (document.format === "hwp") return "hwp_text";
  if (document.format === "hwpx") return "hwpx_text";
  if (document.format === "image") return "ocr_text";
  return "html_text";
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function locatorBoundingBox(value) {
  return value == null ? null : JSON.stringify(stableValue(value));
}

function evidenceId(sourceNotice, segment) {
  const key = JSON.stringify({
    notice_id: sourceNotice.notice_id,
    document_revision_id: segment.document?.document_revision_id ?? null,
    source_type: segment.source_type,
    locator: segment.locator,
    text: normalizeWhitespace(segment.text),
  });
  return `p0ev_${sha256(key).slice(0, 24)}`;
}

function makeSegment(sourceNotice, { text, source_type, locator, document = null, priority = 0, origin = "source_body" }) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return null;
  const segment = { text: normalized, source_type, locator, document, priority, origin };
  segment.evidence_id = evidenceId(sourceNotice, segment);
  return segment;
}

function buildSegments(sourceNotice, sourceDocuments) {
  const allDocuments = sourceDocuments.map(normalizeDocument);
  const diagnostics = {
    rejected_evidence_sources: [],
    low_quality_body_rejected_count: 0,
    attachment_missing_provenance_count: 0,
    attachment_rejected_count: 0,
    ocr_missing_locator_count: 0,
    ocr_low_quality_rejected_count: 0,
    duplicate_evidence_suppressed_count: 0,
  };
  const reject = (source, reason, details = {}) => diagnostics.rejected_evidence_sources.push({ source, reason, ...details });
  const title = makeSegment(sourceNotice, {
    text: sourceNotice.title,
    source_type: "html_text",
    locator: "notice:title:selector:h1",
    priority: 3,
    origin: "title",
  });
  const explicitBodyStatuses = [
    sourceNotice.body_quality_status,
    sourceNotice.body_quality,
    sourceNotice.body_status,
    sourceNotice.body_extraction_status,
  ].map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean);
  const bodySourceType = String(sourceNotice.body_source_type ?? "html_text").trim().toLowerCase();
  const bodyUnsafe = sourceNotice.body_manual_review_required === true
    || explicitBodyStatuses.some((status) => DOCUMENT_FAILURE_STATUSES.has(status) || !SAFE_TEXT_STATUSES.has(status))
    || bodySourceType === "ocr_text";
  const bodySegments = [];
  if (normalizeWhitespace(sourceNotice.body) && bodyUnsafe) {
    diagnostics.low_quality_body_rejected_count += 1;
    reject("source_body", sourceNotice.body_manual_review_required === true ? "manual_review_required" : `unsafe_body_status:${explicitBodyStatuses.join(",") || bodySourceType}`);
  } else if (normalizeWhitespace(sourceNotice.body)) {
    const rawBody = String(sourceNotice.body);
    let searchFrom = 0;
    const parts = rawBody.split(/(?:\r?\n){2,}|\r?\n/u).map((part) => part.trim()).filter(Boolean);
    for (const [index, part] of parts.entries()) {
      const start = rawBody.indexOf(part, searchFrom);
      const end = start + part.length;
      searchFrom = end;
      const segment = makeSegment(sourceNotice, {
        text: part,
        source_type: bodySourceType === "table_text" ? "table_text" : "html_text",
        locator: `notice:body:paragraph:${index}:selector:${sourceNotice.body_selector ?? "main"}:span:${start}-${end}`,
        priority: 0,
        origin: "source_body",
      });
      if (segment) bodySegments.push(segment);
    }
  }
  const documentRejections = new Map();
  for (const document of allDocuments) {
    const missing = [];
    if (!document.document_id) missing.push("document_id");
    if (!document.document_hash) missing.push("document_hash");
    if (!document.document_revision_id) missing.push("document_revision_id");
    if (!document.format || !RECOGNIZED_DOCUMENT_FORMATS.has(document.format)) missing.push("recognized_format");
    if (!document.extraction_status) missing.push("extraction_status");
    if (!document.quality_status) missing.push("quality_status");
    const unsafeStatus = DOCUMENT_FAILURE_STATUSES.has(document.extraction_status)
      || DOCUMENT_FAILURE_STATUSES.has(document.quality_status)
      || !SAFE_TEXT_STATUSES.has(document.extraction_status)
      || !SAFE_TEXT_STATUSES.has(document.quality_status)
      || document.manual_review_required === true;
    if (missing.length || unsafeStatus) {
      const reason = missing.length ? `missing_provenance:${missing.join(",")}` : "unsafe_document_status";
      documentRejections.set(document, reason);
      diagnostics.attachment_rejected_count += 1;
      if (missing.length) diagnostics.attachment_missing_provenance_count += 1;
      if ((document.format === "image" || document.ocr_used) && unsafeStatus) diagnostics.ocr_low_quality_rejected_count += 1;
      reject(`attachment:${document.document_id ?? "unknown"}`, reason, {
        extraction_status: document.extraction_status,
        quality_status: document.quality_status,
      });
    }
  }
  const rejectedDocuments = [...documentRejections.keys()];
  const safeDocuments = allDocuments.filter((document) => !documentRejections.has(document));
  const documentSegments = [];
  for (const document of safeDocuments) {
    const blocks = Array.isArray(document.content_blocks) ? document.content_blocks : [];
    if (blocks.length) {
      for (const [blockIndex, block] of blocks.entries()) {
        const blockText = block.type === "table"
          ? (block.cells?.map((cell) => cell.text).join("\n") ?? block.rows?.flat().join("\n"))
          : (block.text ?? block.items?.join("\n"));
        const resolvedSourceType = sourceType(document, block);
        const boundingBox = locatorBoundingBox(block.bounding_box);
        const locator = `document:${document.document_id}:block:${blockIndex}:page:${block.page_number ?? "unknown"}:bbox:${boundingBox ?? "none"}`;
        const blockStatus = String(block.quality_status ?? block.ocr_quality_status ?? "").trim().toLowerCase();
        const ocrUnsafe = resolvedSourceType === "ocr_text" && (block.page_number == null
          || block.bounding_box == null
          || (blockStatus && (!SAFE_TEXT_STATUSES.has(blockStatus) || DOCUMENT_FAILURE_STATUSES.has(blockStatus)))
          || block.manual_review_required === true);
        if (ocrUnsafe) {
          if (block.page_number == null || block.bounding_box == null) diagnostics.ocr_missing_locator_count += 1;
          else diagnostics.ocr_low_quality_rejected_count += 1;
          reject(`attachment:${document.document_id}:block:${blockIndex}`, block.page_number == null || block.bounding_box == null ? "ocr_missing_locator" : "unsafe_ocr_status");
          continue;
        }
        const segment = makeSegment(sourceNotice, {
          text: blockText,
          source_type: resolvedSourceType,
          locator,
          document,
          priority: block.type === "table" ? 0 : resolvedSourceType === "ocr_text" ? 2 : 1,
          origin: resolvedSourceType === "ocr_text" ? "ocr" : "attachment",
        });
        if (segment) documentSegments.push(segment);
      }
    } else {
      const segment = makeSegment(sourceNotice, {
        text: document.normalized_text ?? document.extracted_text,
        source_type: sourceType(document),
        locator: `document:${document.document_id}:text`,
        document,
        priority: sourceType(document) === "ocr_text" ? 2 : 1,
        origin: sourceType(document) === "ocr_text" ? "ocr" : "attachment",
      });
      if (segment && segment.source_type !== "ocr_text") documentSegments.push(segment);
      else if (segment) {
        diagnostics.ocr_missing_locator_count += 1;
        reject(`attachment:${document.document_id}:text`, "ocr_missing_locator");
      }
    }
  }
  const ordered = [...bodySegments, ...documentSegments, title].filter(Boolean)
    .sort((left, right) => left.priority - right.priority);
  const segmentMap = new Map();
  for (const segment of ordered) {
    if (segmentMap.has(segment.evidence_id)) diagnostics.duplicate_evidence_suppressed_count += 1;
    else segmentMap.set(segment.evidence_id, segment);
  }
  const segments = [...segmentMap.values()];
  const evidence = segments.map((segment) => ({
    evidence_id: segment.evidence_id,
    source_type: segment.source_type,
    source_notice_id: sourceNotice.notice_id,
    document_id: segment.document?.document_id ?? null,
    document_revision_id: segment.document?.document_revision_id ?? null,
    document_hash: segment.document?.document_hash ?? null,
    source_text: segment.text.slice(0, 4000),
    locator: segment.locator,
  }));
  return { segments, title, evidence, rejectedDocuments, diagnostics };
}

function field(status, value = null, refs = []) {
  return { status, value, evidence_references: [...new Set(refs)] };
}

function present(value, segment) {
  return field("present", value, [segment.evidence_id]);
}

function notFound() {
  return field("not_found");
}

function notApplicable() {
  return field("not_applicable");
}

function unknown(refs = []) {
  return field("unknown", null, refs);
}

function lifecycleUnknown(refs = []) {
  return field("unknown", "unknown", refs);
}

function classifyDocument(segments, title) {
  const titleText = title.text;
  const updatedExistingPage = /updated\s+as\s+of|기존\s*페이지\s*(?:수정|업데이트)/iu.test(titleText);
  const matching = (pattern) => segments.filter((segment) => pattern.test(segment.text));
  const correctionSegments = matching(/정정\s*공고|수정\s*공고|마감\s*(?:일\s*)?연장|기간\s*연장|일정\s*변경|대상\s*변경|제출서류\s*변경/iu);
  const resultSegments = matching(/선발\s*결과|합격자\s*발표|장학생\s*명단|최종\s*선정자|심사\s*결과|selection\s+results?|final\s+results?/iu);
  const informationSegments = matching(/설명회|상담회|오리엔테이션|information\s+session|orientation/iu);
  const guidanceSegments = matching(/추천서\s*발급\s*절차|장학\s*제도\s*안내|FAQ|이용\s*가이드|application\s+support\s+guidance/iu);
  const strongRecruitmentTitle = /(?:장학|지원|근로|supporters?|scholarship).*(?:신청|모집|접수|선발\s*(?:공고|안내)|application\s+announcement|recruitment|notice)/iu.test(titleText)
    || /(?:신청|모집|접수).*(?:장학|지원|scholarship)/iu.test(titleText)
    || /장학생\s*선발(?:\s|$)/u.test(titleText);
  const recruitmentPatterns = [
    /신청\s*(?:기간|방법|대상|자격|접수)/u,
    /접수\s*(?:기간|방법|마감)/u,
    /지원\s*(?:대상|자격)/u,
    /온라인\s*(?:신청|접수)|이메일\s*제출|포털\s*온라인\s*신청/u,
    /application\s+(?:period|deadline|method)|apply\s+(?:online|by)/iu,
  ];
  const recruitmentSignalSegments = recruitmentPatterns
    .map((pattern) => matching(pattern)[0])
    .filter(Boolean);
  const recruitmentBodySignals = recruitmentSignalSegments.length;
  const scholarshipContext = /장학|scholarship|fellowship/iu.test(titleText);
  const recruitment = strongRecruitmentTitle
    || recruitmentBodySignals >= 2
    || (scholarshipContext && recruitmentBodySignals >= 1)
    || (updatedExistingPage && scholarshipContext && matching(/application\s+deadline|신청\s*마감/iu).length > 0);
  let document_kind = "unknown_document";
  let matchedSegments = [title];
  let matched_signals = ["classification_uncertain"];
  if (updatedExistingPage && recruitment) {
    document_kind = "recruitment_notice";
    matchedSegments = [title, ...recruitmentSignalSegments];
    matched_signals = ["updated_existing_page", "recruitment_signal"];
  } else if (correctionSegments.length > 0) {
    document_kind = "correction_notice";
    matchedSegments = correctionSegments;
    matched_signals = ["correction_signal"];
  } else if (resultSegments.length > 0 && (resultSegments.some((segment) => segment.origin === "title") || !recruitment)) {
    document_kind = "result_announcement";
    matchedSegments = resultSegments;
    matched_signals = ["result_signal"];
  } else if (informationSegments.length > 0 && !strongRecruitmentTitle) {
    document_kind = "information_session";
    matchedSegments = informationSegments;
    matched_signals = ["information_session_signal"];
  } else if (guidanceSegments.length > 0 && !strongRecruitmentTitle) {
    document_kind = "general_guidance";
    matchedSegments = guidanceSegments;
    matched_signals = ["guidance_signal"];
  } else if (recruitment) {
    document_kind = "recruitment_notice";
    matchedSegments = strongRecruitmentTitle ? [title] : scholarshipContext ? [title, ...recruitmentSignalSegments] : recruitmentSignalSegments;
    matched_signals = [strongRecruitmentTitle ? "strong_recruitment_title" : "recruitment_signal"];
  }
  const uniqueMatched = [...new Map(matchedSegments.map((segment) => [segment.evidence_id, segment])).values()];
  return {
    document_kind,
    source_revision_mode: updatedExistingPage ? "updated_existing_page" : "standalone_document",
    revision_note: updatedExistingPage ? titleText : null,
    evidence_references: uniqueMatched.map((segment) => segment.evidence_id),
    matched_signals,
  };
}

function isCompositeNotice(text) {
  return /국가장학금\s*및\s*사전장학|고대가족장학금.*소망장학금|Merit-.*Need-.*ESP|신준철\s*교우[·ㆍ와과,\s]+정경택\s*교우/iu.test(text);
}

function programNameFromTitle(title) {
  let value = title
    .replace(/^\[[^\]]+\]\s*/u, "")
    .replace(/\(updated\s+as\s+of[^)]*\)/giu, "")
    .replace(/\((?:기간\s*)?연장\)/gu, "")
    .replace(/^(?:20\d{2}(?:학년도|년)?\s*)?(?:(?:1|2)학기|상반기|하반기|Fall|Spring)(?:\s*Semester)?\s*/iu, "")
    .replace(/(?:신청|모집|접수)(?:\s*안내)?(?:\s*\d+차)?\s*$/u, "")
    .replace(/(?:장학생\s*)?선발\s*(?:공고|안내)?\s*$/u, "")
    .replace(/(?:Application\s+Announcement|Recruitment)(?:\s+for\s+(?:Spring|Fall)\s+20\d{2})?\s*$/iu, "")
    .replace(/\s*(?:시행|사업)\s*안내\s*$/u, "")
    .replace(/\s*Notice\s*$/iu, "")
    .trim();
  value = value.replace(/^20\d{2}(?:학년도|년)?\s*(?:(?:1|2)학기\s*)?/u, "").trim();
  return value.length >= 2 ? value : null;
}

function resolveIdentityFields(segments, title, classification, reviewReasons) {
  const corpus = segments.map((segment) => segment.text).join("\n");
  if (TERMINAL_DOCUMENT_KINDS.has(classification.document_kind)) {
    return {
      program_name: notApplicable(), provider: notApplicable(), posting_organization: notFound(), institution_or_campus: notApplicable(),
    };
  }
  if (classification.document_kind === "unknown_document") {
    return {
      program_name: unknown([title.evidence_id]), provider: unknown([title.evidence_id]), posting_organization: notFound(), institution_or_campus: unknown([title.evidence_id]),
    };
  }

  let program_name;
  const explicitProgram = extractExplicitValue(segments, ["장학사업명", "장학금명", "사업명", "프로그램명"]);
  if (explicitProgram) program_name = present(explicitProgram.raw, explicitProgram.segment);
  else if (isCompositeNotice(corpus)) {
    program_name = field("ambiguous", null, [title.evidence_id]);
    reviewReasons.add("program_identity_insufficient");
  } else {
    const titleProgram = programNameFromTitle(title.text);
    program_name = titleProgram ? present(titleProgram, title) : notFound();
  }

  let provider = notFound();
  const explicitProvider = extractExplicitValue(segments, ["지원기관", "제공기관", "지급기관", "사업 주체"]);
  if (explicitProvider) provider = present(explicitProvider.raw, explicitProvider.segment);
  else {
    const providerMatch = title.text.match(/(?:\(재\)\s*)?[가-힣A-Za-z]+(?:장학회|장학재단|재단)|Samsung/iu);
    if (providerMatch) provider = present(normalizeWhitespace(providerMatch[0]), title);
  }

  const postingMatch = extractExplicitValue(segments, ["게시기관", "게시 부서"]);
  const posting_organization = postingMatch ? present(postingMatch.raw, postingMatch.segment) : notFound();
  let institution_or_campus = notFound();
  const campusMatch = corpus.match(/[가-힣]+캠퍼스|Underwood\s+International\s+College|\bUIC\b/iu);
  if (campusMatch) {
    const segment = segments.find((item) => item.text.includes(campusMatch[0])) ?? title;
    institution_or_campus = present(campusMatch[0], segment);
  }
  return { program_name, provider, posting_organization, institution_or_campus };
}

function dateValue(candidate) {
  if (candidate.normalized?.kind === "exact_date") return candidate.normalized.date;
  if (candidate.normalized?.kind === "exact_datetime") return candidate.normalized.datetime;
  return null;
}

function precision(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value ?? "") ? "date" : "datetime";
}

function temporalBoundary(value, boundary) {
  if (precision(value) === "date") return Date.parse(`${value}T${boundary === "start" ? "00:00:00" : "23:59:59"}+09:00`);
  return Date.parse(value);
}

function validCalendarDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function koreanTemporal(yearText, monthText, dayText, hourText = null, minuteText = null, secondText = null) {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!validCalendarDate(year, month, day)) return null;
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (hourText == null) return date;
  const hour = Number(hourText);
  const minute = Number(minuteText ?? 0);
  const second = Number(secondText ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}+09:00`;
}

function koreanApplicationDateCandidates(segments) {
  const candidates = [];
  for (const segment of segments) {
    const text = segment.text;
    const range = text.match(/(?:신청|접수)\s*(?:기간|일정)?\s*(?:은|:)?\s*(?<sy>20\d{2})[.\/-]\s*(?<sm>\d{1,2})[.\/-]\s*(?<sd>\d{1,2})\.?\s*(?:(?<sh>\d{1,2})\s*[:시]\s*(?<smin>\d{2})?)?[^~～\n]{0,12}[~～-]\s*(?:(?<ey>20\d{2})[.\/-]\s*)?(?<em>\d{1,2})[.\/-]\s*(?<ed>\d{1,2})\.?\s*(?:(?<eh>\d{1,2})\s*[:시]\s*(?<emin>\d{2})?)?/u);
    if (range?.groups) {
      const start = koreanTemporal(range.groups.sy, range.groups.sm, range.groups.sd, range.groups.sh, range.groups.smin);
      const deadline = koreanTemporal(range.groups.ey ?? range.groups.sy, range.groups.em, range.groups.ed, range.groups.eh, range.groups.emin);
      if (start && deadline) {
        candidates.push({ role: "application_start", value: start, segment });
        candidates.push({ role: "application_deadline", value: deadline, segment });
      }
    }
    const deadline = text.match(/(?:신청|접수)\s*(?:기간\s*)?(?:마감|종료)\s*:?[\s]*(?<year>20\d{2})[.\/-]\s*(?<month>\d{1,2})[.\/-]\s*(?<day>\d{1,2})\.?\s*(?:(?<hour>\d{1,2})\s*[:시]\s*(?<minute>\d{2})?(?::(?<second>\d{2}))?)?/u);
    if (deadline?.groups) {
      const value = koreanTemporal(deadline.groups.year, deadline.groups.month, deadline.groups.day, deadline.groups.hour, deadline.groups.minute, deadline.groups.second);
      if (value) candidates.push({ role: "application_deadline", value, segment });
    }
  }
  return candidates;
}

function englishDateCandidates(segments) {
  const candidates = [];
  for (const segment of segments) {
    const text = segment.text;
    const range = text.match(/Application\s+(?<startMonth>[A-Za-z]+)\s+(?<startDay>\d{1,2})\s*[–-]\s*(?<endDay>\d{1,2}),\s*(?<year>20\d{2})\s*(?<hour>\d{1,2}):(?<minute>\d{2})\s*KST/iu);
    if (range?.groups) {
      const month = MONTHS[range.groups.startMonth.toLowerCase()];
      if (month) {
        const date = (day) => `${range.groups.year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        candidates.push({ role: "application_start", value: date(range.groups.startDay), segment });
        candidates.push({ role: "application_deadline", value: `${date(range.groups.endDay)}T${String(range.groups.hour).padStart(2, "0")}:${range.groups.minute}:00+09:00`, segment });
      }
    }
    const deadline = text.match(/(?:Application\s+deadline|Deadline)\s+(?<month>[A-Za-z]+)\s+(?<day>\d{1,2}),\s*(?<year>20\d{2})(?:\s+(?<hour>\d{1,2})(?::(?<minute>\d{2}))?)?\s*KST/iu);
    if (deadline?.groups) {
      const month = MONTHS[deadline.groups.month.toLowerCase()];
      if (month) {
        const date = `${deadline.groups.year}-${String(month).padStart(2, "0")}-${String(deadline.groups.day).padStart(2, "0")}`;
        const value = deadline.groups.hour
          ? `${date}T${String(deadline.groups.hour).padStart(2, "0")}:${deadline.groups.minute ?? "00"}:00+09:00`
          : date;
        candidates.push({ role: "application_deadline", value, segment });
      }
    }
  }
  return candidates;
}

function resolveDateFields(segments, classification, asOf, reviewReasons) {
  if (TERMINAL_DOCUMENT_KINDS.has(classification.document_kind)) {
    return { application_start: notApplicable(), application_deadline: notApplicable(), lifecycle_status: notApplicable() };
  }
  if (classification.document_kind === "unknown_document") {
    return { application_start: unknown(classification.evidence_references), application_deadline: unknown(classification.evidence_references), lifecycle_status: lifecycleUnknown(classification.evidence_references) };
  }
  const extracted = extractDateCandidates(segments);
  const candidates = extracted.candidates
    .filter((candidate) => ["application_start", "application_deadline"].includes(candidate.role))
    .map((candidate) => ({ role: candidate.role, value: dateValue(candidate), segment: candidate.segment }))
    .filter((candidate) => candidate.value);
  candidates.push(...koreanApplicationDateCandidates(segments));
  candidates.push(...englishDateCandidates(segments));
  const resolveRole = (role) => {
    const roleCandidates = candidates.filter((candidate) => candidate.role === role);
    const unique = new Map();
    for (const candidate of roleCandidates) if (!unique.has(candidate.value)) unique.set(candidate.value, candidate);
    if (unique.size === 1) {
      const candidate = [...unique.values()][0];
      return present(candidate.value, candidate.segment);
    }
    if (unique.size > 1) {
      reviewReasons.add("conflicting_date_evidence");
      return field("conflicting", null, roleCandidates.map((candidate) => candidate.segment.evidence_id));
    }
    if (extracted.yearlessRoles.has(role)) {
      reviewReasons.add("ambiguous_date_role");
      return field("ambiguous", null, []);
    }
    return notFound();
  };
  let application_start = resolveRole("application_start");
  let application_deadline = resolveRole("application_deadline");
  if (application_start.status === "present" && application_deadline.status === "present") {
    const start = temporalBoundary(application_start.value, "start");
    const deadline = temporalBoundary(application_deadline.value, "end");
    if (!Number.isFinite(start) || !Number.isFinite(deadline) || start > deadline) {
      const refs = [...application_start.evidence_references, ...application_deadline.evidence_references];
      application_start = field("conflicting", null, refs);
      application_deadline = field("conflicting", null, refs);
      reviewReasons.add("conflicting_date_evidence");
    }
  }
  let lifecycle_status;
  const dateRefs = [...application_start.evidence_references, ...application_deadline.evidence_references];
  if (classification.document_kind === "correction_notice") {
    lifecycle_status = lifecycleUnknown(dateRefs);
    reviewReasons.add("relation_resolution_required");
  } else if (application_start.status === "present" && application_deadline.status === "present") {
    if (precision(application_start.value) !== precision(application_deadline.value)) {
      lifecycle_status = lifecycleUnknown(dateRefs);
      reviewReasons.add("mixed_date_precision_requires_review");
    } else {
      const instant = Date.parse(asOf);
      const start = temporalBoundary(application_start.value, "start");
      const deadline = temporalBoundary(application_deadline.value, "end");
      const value = instant < start ? "upcoming" : instant > deadline ? "closed" : "open";
      lifecycle_status = field("present", value, dateRefs);
    }
  } else {
    lifecycle_status = lifecycleUnknown(dateRefs);
    if ([application_start.status, application_deadline.status].includes("conflicting")) reviewReasons.add("conflicting_date_evidence");
    else if ([application_start.status, application_deadline.status].includes("ambiguous")) reviewReasons.add("ambiguous_date_role");
    else reviewReasons.add("missing_primary_application_window");
  }
  return { application_start, application_deadline, lifecycle_status };
}

function routeIdentity(value) {
  try {
    const url = new URL(value);
    const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/u, "") : url.pathname;
    return `${url.hostname.toLowerCase()}|${url.port}|${pathname}`;
  } catch {
    return null;
  }
}

function resolveApplicationUrl(segments, sourceUrl, terminal) {
  if (terminal) return notApplicable();
  const candidates = [];
  for (const segment of segments) {
    for (const line of segment.text.split(/\n+/u)) {
      if (!/(?:온라인\s*신청|신청\s*페이지|접수\s*사이트|지원하기|제출\s*링크|신청\s*시스템|apply\s+(?:here|online)|application\s+(?:page|portal))/iu.test(line)) continue;
      for (const match of line.matchAll(/https?:\/\/[^\s<>"')\]]+/giu)) {
        const value = match[0].replace(/[.,;:]$/u, "");
        if (routeIdentity(value) !== routeIdentity(sourceUrl)) candidates.push({ value, segment });
      }
    }
  }
  const unique = new Map();
  for (const candidate of candidates) if (!unique.has(candidate.value)) unique.set(candidate.value, candidate);
  if (unique.size === 0) return notFound();
  if (unique.size > 1) return field("ambiguous", null, candidates.map((candidate) => candidate.segment.evidence_id));
  const candidate = [...unique.values()][0];
  return present(candidate.value, candidate.segment);
}

function krwAmount(numberText, unitText = "원") {
  const number = Number(String(numberText).replaceAll(",", ""));
  if (unitText.startsWith("백만")) return number * 1_000_000;
  if (unitText.startsWith("만")) return number * 10_000;
  return number;
}

function amountValue(segment, value) {
  return {
    display: value.display,
    kind: value.kind,
    currency: Object.hasOwn(value, "currency") ? value.currency : "KRW",
    period: value.period ?? "one_time",
    source_text: segment.text,
    evidence_references: [segment.evidence_id],
    ...value,
  };
}

function resolveSupportFields(segments, classification, opportunityKind, reviewReasons) {
  if (TERMINAL_DOCUMENT_KINDS.has(classification.document_kind)) {
    return { support_type: notApplicable(), support_amount: notApplicable() };
  }
  if (classification.document_kind === "unknown_document") {
    return { support_type: unknown(classification.evidence_references), support_amount: unknown(classification.evidence_references) };
  }
  const complexSegment = segments.find((item) => {
    const text = item.text;
    const periodicComponents = /KRW\s*\d[\d,]*\s*per\s*month/iu.test(text) && /KRW\s*\d[\d,]*\s*per\s*hour/iu.test(text);
    const targetTiers = [...text.matchAll(/(?:중[·ㆍ]?고생|학교밖청소년|전문대|종합대)\s*\d[\d,]*\s*(?:백만(?:원)?|만(?:원)?|원)/gu)].length >= 2;
    const namedComponents = /등록금(?:\s*지원)?\s*\d[\d,]*\s*(?:백만(?:원)?|만(?:원)?|원)/u.test(text)
      && /생활비(?:\s*지원)?\s*\d[\d,]*\s*(?:백만(?:원)?|만(?:원)?|원)/u.test(text);
    return periodicComponents || targetTiers || namedComponents || /full\s+tuition.*(?:1\/2|1\/3)|(?:1\/2|1\/3).*full\s+tuition/iu.test(text);
  });
  const segment = complexSegment ?? segments.find((item) => /\d[\d,]*\s*(?:백만(?:원)?|만(?:원)?|원)|KRW\s*\d|등록금(?:의)?\s*(?:전액|\d+%)|full\s+tuition|희망\s*금액|심사\s*후\s*결정/iu.test(item.text))
    ?? segments.find((item) => /장학|지원|혜택|금액|등록금|tuition|scholarship/iu.test(item.text));
  if (!segment) return { support_type: notFound(), support_amount: notFound() };
  const text = segment.text;
  if (opportunityKind === "paid_student_activity") {
    const monthly = text.match(/KRW\s*(\d[\d,]*)\s*per\s*month/iu);
    const hourly = text.match(/KRW\s*(\d[\d,]*)\s*per\s*hour/iu);
    if (monthly && hourly) {
      reviewReasons.add("complex_amount_structure");
      reviewReasons.add("amount_schema_expressiveness_gap");
      return {
        support_type: present(["activity_scholarship", "work_scholarship"], segment),
        support_amount: field("schema_expressiveness_gap", amountValue(segment, {
          display: `${monthly[0]} + ${hourly[0]}`,
          kind: "composite_components",
          components: [
            { kind: "recurring_monthly", display: monthly[0], currency: "KRW", exact_amount: krwAmount(monthly[1]), period: "month" },
            { kind: "hourly_rate", display: hourly[0], currency: "KRW", exact_amount: krwAmount(hourly[1]), period: "hour" },
          ],
        }), [segment.evidence_id]),
      };
    }
  }
  const tierMatches = [...text.matchAll(/(?<label>중[·ㆍ]?고생|학교밖청소년|전문대|종합대)\s*(?<value>\d[\d,]*)\s*(?<unit>백만(?:원)?|만(?:원)?|원)/gu)];
  if (tierMatches.length >= 2) {
    reviewReasons.add("complex_amount_structure");
    reviewReasons.add("amount_schema_expressiveness_gap");
    return {
      support_type: present(["cash_award"], segment),
      support_amount: field("schema_expressiveness_gap", amountValue(segment, {
        display: tierMatches.map((match) => match[0]).join(" / "),
        kind: "tiered_by_target",
        components: tierMatches.map((match) => ({
          kind: "exact", display: match[0], currency: "KRW", exact_amount: krwAmount(match.groups.value, match.groups.unit), target_label: match.groups.label,
        })),
      }), [segment.evidence_id]),
    };
  }
  const namedComponents = [
    { label: "등록금", match: text.match(/등록금(?:\s*지원)?\s*(?<value>\d[\d,]*)\s*(?<unit>백만(?:원)?|만(?:원)?|원)/u), supportType: "tuition_support" },
    { label: "생활비", match: text.match(/생활비(?:\s*지원)?\s*(?<value>\d[\d,]*)\s*(?<unit>백만(?:원)?|만(?:원)?|원)/u), supportType: "living_expense" },
  ].filter((component) => component.match?.groups);
  if (namedComponents.length >= 2) {
    reviewReasons.add("complex_amount_structure");
    reviewReasons.add("amount_schema_expressiveness_gap");
    return {
      support_type: present(namedComponents.map((component) => component.supportType), segment),
      support_amount: field("schema_expressiveness_gap", amountValue(segment, {
        display: namedComponents.map((component) => component.match[0]).join(" + "),
        kind: "composite_components",
        components: namedComponents.map((component) => ({
          kind: "exact",
          display: component.match[0],
          currency: "KRW",
          exact_amount: krwAmount(component.match.groups.value, component.match.groups.unit),
          period: "one_time",
          target_label: component.label,
        })),
      }), [segment.evidence_id]),
    };
  }
  if (/full\s+tuition.*(?:1\/2|1\/3)|(?:1\/2|1\/3).*full\s+tuition/iu.test(text)) {
    reviewReasons.add("complex_amount_structure");
    reviewReasons.add("amount_schema_expressiveness_gap");
    return {
      support_type: present(["tuition_support"], segment),
      support_amount: field("schema_expressiveness_gap", amountValue(segment, {
        display: "full tuition / 1/2 / 1/3",
        kind: "multiple_program_schema_gap",
        currency: null,
        period: "semester",
      }), [segment.evidence_id]),
    };
  }
  if (/희망\s*금액/u.test(text)) {
    reviewReasons.add("llm_assisted_draft_recommended");
    return {
      support_type: present(["applicant_requested"], segment),
      support_amount: present(amountValue(segment, { display: "신청자 희망금액", kind: "applicant_requested", currency: null, period: "not_applicable", cap_basis: "requested_amount" }), segment),
    };
  }
  if (/심사\s*후\s*결정|금액\s*미정/u.test(text)) {
    reviewReasons.add("llm_assisted_draft_recommended");
    return {
      support_type: present(["cash_award"], segment),
      support_amount: present(amountValue(segment, { display: "심사 후 결정", kind: "not_predefined", currency: null, period: "not_applicable", cap_basis: "review_decision" }), segment),
    };
  }
  const percentage = text.match(/등록금(?:의)?\s*(\d{1,3})%/u);
  if (percentage) return {
    support_type: present(["tuition_support"], segment),
    support_amount: present(amountValue(segment, { display: percentage[0], kind: "percentage_of_tuition", currency: null, percentage: Number(percentage[1]), period: "semester" }), segment),
  };
  const fullTuition = text.match(/등록금\s*전액|full\s+tuition/iu);
  if (fullTuition) return {
    support_type: present(["tuition_support"], segment),
    support_amount: present(amountValue(segment, { display: fullTuition[0], kind: "full_tuition", currency: null, period: "semester" }), segment),
  };
  const range = text.match(/(?<min>\d[\d,]*)\s*(?<minUnit>백만(?:원)?|만(?:원)?|원)\s*[~～-]\s*(?<max>\d[\d,]*)\s*(?<maxUnit>백만(?:원)?|만(?:원)?|원)/u);
  if (range?.groups) return {
    support_type: present(["cash_award"], segment),
    support_amount: present(amountValue(segment, {
      display: range[0], kind: "range", minimum_amount: krwAmount(range.groups.min, range.groups.minUnit), maximum_amount: krwAmount(range.groups.max, range.groups.maxUnit),
    }), segment),
  };
  const englishPeriodic = text.match(/KRW\s*(?<value>\d[\d,]*)\s*per\s*(?<period>month|semester|hour)/iu);
  if (englishPeriodic?.groups) {
    const kind = { month: "recurring_monthly", semester: "recurring_semester", hour: "hourly_rate" }[englishPeriodic.groups.period.toLowerCase()];
    return {
      support_type: present([kind === "hourly_rate" ? "work_scholarship" : "cash_award"], segment),
      support_amount: present(amountValue(segment, { display: englishPeriodic[0], kind, exact_amount: krwAmount(englishPeriodic.groups.value), period: englishPeriodic.groups.period.toLowerCase() }), segment),
    };
  }
  const koreanPeriodic = text.match(/(?<period>월|학기당|매\s*학기|시간당)\s*(?<value>\d[\d,]*)\s*(?<unit>백만(?:원)?|만(?:원)?|원)/u);
  if (koreanPeriodic?.groups) {
    const periodKey = /월/u.test(koreanPeriodic.groups.period) ? "month" : /시간/u.test(koreanPeriodic.groups.period) ? "hour" : "semester";
    const kind = { month: "recurring_monthly", semester: "recurring_semester", hour: "hourly_rate" }[periodKey];
    return {
      support_type: present([kind === "hourly_rate" ? "work_scholarship" : "cash_award"], segment),
      support_amount: present(amountValue(segment, { display: koreanPeriodic[0], kind, exact_amount: krwAmount(koreanPeriodic.groups.value, koreanPeriodic.groups.unit), period: periodKey }), segment),
    };
  }
  const cap = text.match(/(?<value>\d[\d,]*)\s*(?<unit>백만(?:원)?|만(?:원)?|원)\s*(?:이내|이하|한도)/u);
  if (cap?.groups) return {
    support_type: present([/등록금/u.test(text) ? "tuition_support" : "cash_award"], segment),
    support_amount: present(amountValue(segment, {
      display: cap[0], kind: "maximum_cap", maximum_amount: krwAmount(cap.groups.value, cap.groups.unit), cap_basis: "stated_maximum",
    }), segment),
  };
  const exact = text.match(/(?<value>\d[\d,]*)\s*(?<unit>백만(?:원)?|만(?:원)?|원)/u);
  if (exact?.groups) {
    const numeric = krwAmount(exact.groups.value, exact.groups.unit);
    return {
      support_type: present([/등록금/u.test(text) ? "tuition_support" : "cash_award"], segment),
      support_amount: present(amountValue(segment, { display: exact[0], kind: "exact", exact_amount: numeric }), segment),
    };
  }
  const englishExact = text.match(/KRW\s*(?<value>\d[\d,]*)(?:\s+each)?/iu);
  if (englishExact?.groups) return {
    support_type: present(["cash_award"], segment),
    support_amount: present(amountValue(segment, { display: englishExact[0], kind: "exact", exact_amount: krwAmount(englishExact.groups.value) }), segment),
  };
  return { support_type: notFound(), support_amount: notFound() };
}

function addFieldReviewReasons(fields, reviewReasons) {
  for (const [fieldName, fieldValue] of Object.entries(fields)) {
    const status = fieldValue.status;
    if (FIELD_REVIEW_POLICY.unsafe_statuses.includes(status)) {
      const existing = FIELD_REVIEW_POLICY.field_reason_options[fieldName]?.some((reason) => reviewReasons.has(reason));
      if (!existing) {
        if (["application_start", "application_deadline"].includes(fieldName) && status === "conflicting") reviewReasons.add("conflicting_date_evidence");
        else if (["application_start", "application_deadline"].includes(fieldName)) reviewReasons.add("ambiguous_date_role");
        else reviewReasons.add(FIELD_REVIEW_POLICY.field_reason_options[fieldName]?.[0]);
      }
    }
    const notFoundReason = FIELD_REVIEW_POLICY.not_found_requires_review[fieldName];
    if (status === "not_found" && notFoundReason) reviewReasons.add(notFoundReason);
  }
  reviewReasons.delete(undefined);
}

function extractWithDiagnostics({ sourceNotice, sourceDocuments = [], extractionContext = {} }) {
  assertInput(sourceNotice, extractionContext);
  const case_id = extractionContext.caseId ?? sourceNotice.case_id ?? sourceNotice.notice_id;
  const asOf = extractionContext.asOf ?? extractionContext.extractedAt;
  const { segments, title, evidence, rejectedDocuments, diagnostics } = buildSegments(sourceNotice, sourceDocuments);
  const reviewReasons = new Set();
  if (rejectedDocuments.length || diagnostics.low_quality_body_rejected_count > 0 || diagnostics.ocr_missing_locator_count > 0 || diagnostics.ocr_low_quality_rejected_count > 0) {
    reviewReasons.add("upstream_evidence_incomplete");
  }
  const baseClassification = classifyDocument(segments, title);
  const terminal = TERMINAL_DOCUMENT_KINDS.has(baseClassification.document_kind);
  const relationRequired = ["correction_notice", "result_announcement"].includes(baseClassification.document_kind);
  let opportunity_kind = terminal ? "not_applicable" : baseClassification.document_kind === "unknown_document" ? "unknown" : "scholarship";
  const corpus = segments.map((segment) => segment.text).join("\n");
  if (!terminal && /(?:supporters?|근로|활동).*(?:KRW|원|장학|보상)|(?:KRW|원|장학|보상).*(?:supporters?|근로|활동)/iu.test(corpus)) {
    opportunity_kind = "paid_student_activity";
    reviewReasons.add("paid_activity_feed_partition_required");
  }
  if (relationRequired) reviewReasons.add("relation_resolution_required");
  if (baseClassification.document_kind === "unknown_document") reviewReasons.add("classification_uncertain");
  if (baseClassification.source_revision_mode === "updated_existing_page") reviewReasons.add("source_revision_history_missing");

  const identityFields = resolveIdentityFields(segments, title, baseClassification, reviewReasons);
  const composite = isCompositeNotice(corpus);
  const publishable_opportunity = baseClassification.document_kind === "recruitment_notice"
    && identityFields.program_name.status === "present"
    && !composite;
  if (baseClassification.document_kind === "recruitment_notice" && !publishable_opportunity) reviewReasons.add("publishability_requires_confirmation");

  const dateFields = resolveDateFields(segments, baseClassification, asOf, reviewReasons);
  const application_url = resolveApplicationUrl(segments, sourceNotice.canonical_url, terminal);
  const supportFields = resolveSupportFields(segments, baseClassification, opportunity_kind, reviewReasons);
  const fields = { ...identityFields, ...dateFields, application_url, ...supportFields };
  addFieldReviewReasons(fields, reviewReasons);

  const classification = {
    document_kind: baseClassification.document_kind,
    publishable_opportunity,
    opportunity_kind,
    terminal_non_opportunity: terminal,
    relation_resolution_required: relationRequired,
    source_revision_mode: baseClassification.source_revision_mode,
    revision_note: baseClassification.revision_note,
    evidence_references: baseClassification.evidence_references,
  };
  const output = {
    schema_version: P0_REMEDIATION_SCHEMA_VERSION,
    case_id: String(case_id),
    source: { notice_id: sourceNotice.notice_id, canonical_url: sourceNotice.canonical_url },
    classification,
    fields,
    review: {
      required: reviewReasons.size > 0,
      reasons: [...reviewReasons].sort(),
      automatic_publish_allowed: false,
    },
    evidence_references: evidence,
  };
  const evidenceById = new Map(evidence.map((item) => [item.evidence_id, item]));
  const presentFieldEvidenceSources = Object.fromEntries(Object.entries(fields)
    .filter(([, fieldValue]) => fieldValue.status === "present")
    .map(([fieldName, fieldValue]) => [fieldName, [...new Set(fieldValue.evidence_references.map((reference) => evidenceById.get(reference)?.source_type).filter(Boolean))]]));
  const attachmentSourceTypes = new Set(["pdf_text", "table_text", "hwp_text", "hwpx_text"]);
  diagnostics.classification_evidence_ids = [...classification.evidence_references];
  diagnostics.classification_matched_signals = [...baseClassification.matched_signals];
  diagnostics.classification_title_only_count = classification.evidence_references.length === 1
    && evidenceById.get(classification.evidence_references[0])?.locator.startsWith("notice:title") ? 1 : 0;
  diagnostics.classification_multi_evidence_count = classification.evidence_references.length > 1 ? 1 : 0;
  diagnostics.present_field_evidence_sources = presentFieldEvidenceSources;
  diagnostics.attachment_present_claim_count = Object.values(presentFieldEvidenceSources)
    .filter((types) => types.some((type) => attachmentSourceTypes.has(type))).length;
  diagnostics.ocr_present_claim_count = Object.values(presentFieldEvidenceSources)
    .filter((types) => types.includes("ocr_text")).length;
  return { output, diagnostics };
}

export function extractP0RemediatedCandidate(input) {
  return extractWithDiagnostics(input).output;
}

export function extractP0RemediatedCandidateWithDiagnostics(input) {
  return extractWithDiagnostics(input);
}
