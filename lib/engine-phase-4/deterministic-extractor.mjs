import { sha256, stableUuid } from "../post-phase-l/normalized-graph.mjs";
import { DOCUMENT_PARSING_CONTRACT_VERSION } from "../crawler-engine/document-parsing/contract.mjs";
import {
  detectLanguage,
  extractAmountCandidates,
  extractApplicationMethods,
  extractApplicationUrl,
  extractContacts,
  extractCycleLabel,
  extractDateCandidates,
  extractEligibility,
  extractExplicitValue,
  extractRequiredDocuments,
  normalizeIdentityText,
  normalizeWhitespace,
} from "./deterministic-normalizers.mjs";
import {
  DETERMINISTIC_EXTRACTOR_NAME,
  DETERMINISTIC_EXTRACTOR_VERSION,
  createEvidenceCollector,
  sourceTypeForDocument,
} from "./evidence-builder.mjs";

export const DETERMINISTIC_EXTRACTION_CONTRACT_VERSION = "engine-phase-4-deterministic-baseline/v1";

const REQUIRED_NOTICE_FIELDS = [
  "source_id", "source_key_snapshot", "notice_id", "identity_kind", "identity_key",
  "canonical_url", "revision_id", "title",
];
const DOCUMENT_FAILURE_STATUSES = new Set([
  "ocr_low_quality", "tool_unavailable", "unsupported_format", "parser_failed", "download_failed",
  "encrypted_or_protected", "bounded_limit_exceeded", "manual_review_required",
]);

function assertInput(sourceNotice, extractionContext) {
  for (const field of REQUIRED_NOTICE_FIELDS) {
    if (!String(sourceNotice?.[field] ?? "").trim()) throw new TypeError(`sourceNotice.${field} is required`);
  }
  if (!/^https?:\/\//u.test(sourceNotice.canonical_url)) throw new TypeError("sourceNotice.canonical_url must be HTTP(S)");
  if (!extractionContext?.extractedAt || !/^\d{4}-\d{2}-\d{2}T/u.test(extractionContext.extractedAt)) {
    throw new TypeError("extractionContext.extractedAt must be an injected ISO timestamp");
  }
}

function normalizeSourceDocument(document) {
  const documentId = String(document.document_id ?? "").trim();
  const documentHash = String(document.document_hash ?? document.byte_sha256 ?? "").trim();
  if (!documentId || !/^[a-f0-9]{64}$/u.test(documentHash)) return null;
  const documentRevisionId = String(document.document_revision_id ?? "").trim()
    || stableUuid("ingestion_source_document_revisions", `${documentId}|${documentHash}`);
  const detectedFormat = String(document.media_type ?? document.detected_format ?? "other").toLowerCase();
  const mediaType = ["html", "pdf", "hwp", "hwpx", "image"].includes(detectedFormat) ? detectedFormat : "other";
  return {
    document_id: documentId,
    document_revision_id: documentRevisionId,
    document_hash: documentHash,
    attachment_url: document.attachment_url ?? document.canonical_url ?? document.original_url ?? null,
    media_type: mediaType,
    parser_version: document.parser_version ?? DOCUMENT_PARSING_CONTRACT_VERSION,
    detected_format: mediaType,
    extraction_status: document.extraction_status ?? "text_sufficient",
    quality_status: document.quality_status ?? "text_sufficient",
    manual_review_required: document.manual_review_required === true,
    manual_review_reasons: document.manual_review_reasons ?? [],
    ocr_used: document.ocr_used === true,
    normalized_text: document.normalized_text ?? document.extracted_text ?? "",
    content_blocks: Array.isArray(document.content_blocks) ? document.content_blocks : [],
  };
}

function baseLocator(overrides = {}) {
  return {
    page_number: null,
    section: null,
    html_selector: null,
    attribute_name: null,
    text_span: null,
    table_coordinates: null,
    bounding_box: null,
    ...overrides,
  };
}

function documentSegments(document) {
  const segments = [];
  for (const block of document.content_blocks) {
    if (block.type === "table") {
      const cells = block.cells?.length
        ? block.cells.map((cell) => ({ text: cell.text, row: cell.row_index, column: cell.column_index }))
        : (block.rows ?? []).flatMap((row, rowIndex) => row.map((text, columnIndex) => ({ text, row: rowIndex, column: columnIndex })));
      for (const cell of cells) {
        if (!normalizeWhitespace(cell.text)) continue;
        segments.push({
          text: cell.text,
          source_type: sourceTypeForDocument(document, block),
          document,
          locator: baseLocator({
            page_number: block.page_number ?? null,
            section: block.caption ?? "table",
            table_coordinates: { row: cell.row, column: cell.column, row_span: 1, column_span: 1 },
          }),
        });
      }
      continue;
    }
    const text = block.text ?? (Array.isArray(block.items) ? block.items.join("\n") : "");
    if (!normalizeWhitespace(text)) continue;
    const sourceType = sourceTypeForDocument(document, block);
    const locator = baseLocator({
      page_number: block.page_number ?? null,
      section: block.section ?? block.type ?? null,
      bounding_box: block.bounding_box ?? null,
    });
    if (sourceType === "ocr_text" && (!locator.page_number || !locator.bounding_box)) continue;
    segments.push({ text, source_type: sourceType, document, locator });
  }
  if (segments.length === 0 && normalizeWhitespace(document.normalized_text) && document.detected_format === "hwp") {
    segments.push({ text: document.normalized_text, source_type: "hwp_text", document, locator: baseLocator({ section: "document" }) });
  }
  if (segments.length === 0 && normalizeWhitespace(document.normalized_text) && document.detected_format === "hwpx") {
    segments.push({ text: document.normalized_text, source_type: "hwpx_text", document, locator: baseLocator({ section: "document" }) });
  }
  return segments;
}

function buildSegments(sourceNotice, documents) {
  const titleSegment = {
    text: sourceNotice.title,
    source_type: "html_text",
    locator: baseLocator({ section: "heading", html_selector: "h1" }),
  };
  const bodySegment = normalizeWhitespace(sourceNotice.body)
    ? {
        text: sourceNotice.body,
        source_type: "html_text",
        locator: baseLocator({ section: "body", html_selector: sourceNotice.body_selector ?? "main" }),
      }
    : null;
  const safeDocuments = documents.filter((document) => !DOCUMENT_FAILURE_STATUSES.has(document.quality_status)
    && !DOCUMENT_FAILURE_STATUSES.has(document.extraction_status)
    && !document.manual_review_required);
  return {
    titleSegment,
    bodySegment,
    safeSegments: [titleSegment, bodySegment, ...safeDocuments.flatMap(documentSegments)].filter(Boolean),
    allSegments: [titleSegment, bodySegment, ...documents.flatMap(documentSegments)].filter(Boolean),
  };
}

function field(valueStatus = "not_found", rawValue = null, normalizedValue = null, evidenceRefs = [], confidence = 1, validationErrors = []) {
  return {
    raw_value: rawValue,
    normalized_value: normalizedValue,
    value_status: valueStatus,
    confidence,
    evidence_refs: [...new Set(evidenceRefs)],
    validation_errors: validationErrors,
    inference: { is_inferred: false, reason: null },
  };
}

function classifyNotice(segments, collector) {
  const corpus = segments.map((segment) => segment.text).join("\n");
  const title = segments[0];
  const resultPattern = /(?:선발|심사|장학생|합격자)\s*(?:결과|발표|명단)|(?:결과|합격자)\s*(?:발표|공지)/u;
  const resultTitleSignal = resultPattern.test(title.text);
  const resultSignal = resultTitleSignal || (resultPattern.test(corpus) && !/(?:모집|선발)\s*(?:공고|안내|요강)?/u.test(title.text));
  const correctionSignal = /(?:정정\s*공고|수정\s*공고|변경\s*안내|마감\s*연장)/u.test(corpus);
  const infoSignal = /(?:설명회|상담회|오리엔테이션)\s*(?:개최|안내|신청)?/u.test(corpus);
  const guidanceSignal = /(?:장학\s*제도|일반)\s*(?:이용\s*)?(?:안내|가이드)|FAQ/u.test(corpus);
  const recruitmentSignals = [/(?:모집|선발)\s*(?:공고|안내|요강)?/u, /(?:신청|접수)\s*(?:기간|마감|방법)/u, /지원\s*자격/u]
    .filter((pattern) => pattern.test(corpus)).length;
  let documentKind = "unknown";
  let confidence = 0.5;
  const reasons = [];
  if (resultTitleSignal && recruitmentSignals >= 2) reasons.push("classification_conflict");
  else if (correctionSignal) { documentKind = "correction_notice"; confidence = 0.95; }
  else if (resultSignal) { documentKind = "result_announcement"; confidence = 0.98; }
  else if (infoSignal) { documentKind = "information_session"; confidence = 0.95; }
  else if (guidanceSignal) { documentKind = "general_guidance"; confidence = 0.92; }
  else if (recruitmentSignals >= 2) { documentKind = "recruitment_notice"; confidence = 0.98; }
  else reasons.push("classification_uncertain");
  const matched = segments.find((segment) => {
    const text = segment.text;
    if (documentKind === "result_announcement") return /결과|합격자|장학생/u.test(text);
    if (documentKind === "correction_notice") return /정정|수정|변경|연장/u.test(text);
    if (documentKind === "information_session") return /설명회|상담회|오리엔테이션/u.test(text);
    if (documentKind === "general_guidance") return /제도|일반|가이드|FAQ/u.test(text);
    if (documentKind === "recruitment_notice") return /모집|신청|접수|지원\s*자격/u.test(text);
    return segment === title;
  }) ?? title;
  const evidenceRefs = [collector.add({ segment: title, text: title.text, role: "classification" })];
  if (matched !== title) evidenceRefs.push(collector.add({ segment: matched, text: matched.text.slice(0, 300), role: "classification" }));
  return {
    value: { document_kind: documentKind, is_recruitment: documentKind === "recruitment_notice", confidence, evidence_refs: [...new Set(evidenceRefs)] },
    reasons,
  };
}

function evidenceForMatch(collector, match, role) {
  return collector.add({ segment: match.segment, text: match.line ?? match.raw ?? match.segment.text, role });
}

function resolveDateFields(segments, collector, classification, reviewReasons, lowQualityInput) {
  const roles = ["application_start", "application_deadline", "recommendation_deadline", "result_announcement_date"];
  const fields = Object.fromEntries(roles.map((role) => [role, field()]));
  if (["result_announcement", "information_session", "general_guidance", "correction_notice"].includes(classification.document_kind)) {
    fields.application_start = field("not_applicable");
    fields.application_deadline = field("not_applicable");
    fields.recommendation_deadline = field("not_applicable");
  }
  const { candidates, yearlessRoles } = extractDateCandidates(segments);
  for (const role of roles) {
    const roleCandidates = candidates.filter((candidate) => candidate.role === role);
    const unique = new Map(roleCandidates.map((candidate) => [JSON.stringify(candidate.normalized), candidate]));
    if (unique.size === 1) {
      const match = [...unique.values()][0];
      fields[role] = field("present", match.raw, match.normalized, [evidenceForMatch(collector, match, role)], 1);
    } else if (unique.size > 1) {
      const sourceClasses = new Set(roleCandidates.map((candidate) => candidate.segment.document ? "document" : "notice"));
      const status = sourceClasses.size > 1 ? "conflicting" : "ambiguous";
      const refs = roleCandidates.map((candidate) => evidenceForMatch(collector, candidate, role));
      fields[role] = field(status, roleCandidates.map((candidate) => candidate.raw).join(" | "), null, refs, 0, [`multiple_${role}`]);
      reviewReasons.add(status === "conflicting" ? "conflicting_date_evidence" : "ambiguous_date_role");
    } else if (yearlessRoles.has(role)) {
      fields[role] = field("ambiguous", null, null, [], 0, ["missing_explicit_year"]);
      reviewReasons.add("unsupported_yearless_date");
    } else if (lowQualityInput && fields[role].value_status === "not_found") {
      fields[role] = field("unknown", null, null, [], 0, ["low_quality_input"]);
    }
  }
  return fields;
}

function resolveAmountFields(segments, collector, reviewReasons, lowQualityInput) {
  const candidates = extractAmountCandidates(segments);
  if (candidates.length === 0) {
    return {
      amount: lowQualityInput ? field("unknown", null, null, [], 0, ["low_quality_input"]) : field(),
      benefit_type: lowQualityInput ? field("unknown", null, null, [], 0, ["low_quality_input"]) : field(),
      payment_frequency: field(),
    };
  }
  const refs = candidates.map((candidate) => evidenceForMatch(collector, candidate, "amount"));
  if (candidates.length > 1) {
    reviewReasons.add("conflicting_or_multiple_benefits");
    return {
      amount: field("ambiguous", candidates.map((candidate) => candidate.raw).join(" | "), null, refs, 0, ["multiple_benefit_types"]),
      benefit_type: field("ambiguous", candidates.map((candidate) => candidate.normalized.kind).join(" | "), null, refs, 0, ["multiple_benefit_types"]),
      payment_frequency: field("ambiguous", null, null, refs, 0, ["multiple_benefit_types"]),
    };
  }
  const candidate = candidates[0];
  const benefit = candidate.normalized.kind === "exact" || candidate.normalized.kind === "range"
    ? "cash" : candidate.normalized.kind;
  return {
    amount: field("present", candidate.raw, candidate.normalized, refs, 1),
    benefit_type: field("present", candidate.raw, [benefit], refs, 1),
    payment_frequency: field("present", candidate.raw, candidate.normalized.period, refs, 1),
  };
}

function sourceDocumentsForRecord(documents) {
  return documents.map((document) => ({
    document_id: document.document_id,
    document_revision_id: document.document_revision_id,
    document_hash: document.document_hash,
    attachment_url: document.attachment_url,
    media_type: document.detected_format,
    parser_version: document.parser_version,
  }));
}

export function extractDeterministicScholarshipCandidate({ sourceNotice, sourceDocuments = [], extractionContext }) {
  assertInput(sourceNotice, extractionContext);
  const documents = sourceDocuments.map(normalizeSourceDocument).filter(Boolean);
  const { titleSegment, bodySegment, safeSegments, allSegments } = buildSegments(sourceNotice, documents);
  const collector = createEvidenceCollector({ sourceNotice, extractionContext });
  const reviewReasons = new Set();
  const lowQualityDocuments = documents.filter((document) => DOCUMENT_FAILURE_STATUSES.has(document.quality_status)
    || DOCUMENT_FAILURE_STATUSES.has(document.extraction_status)
    || document.manual_review_required);
  const lowQualityInput = lowQualityDocuments.length > 0 && !bodySegment;
  for (const document of lowQualityDocuments) {
    reviewReasons.add(document.ocr_used ? "low_quality_ocr" : "document_parser_partial_or_failed");
  }
  if (!bodySegment && documents.length > 0) reviewReasons.add("attachment_only_notice");
  if (sourceNotice.body_quality_status && !["text_sufficient", "success"].includes(sourceNotice.body_quality_status)) {
    reviewReasons.add("source_notice_body_quality_insufficient");
  }

  const classification = classifyNotice(safeSegments, collector);
  classification.reasons.forEach((reason) => reviewReasons.add(reason));
  const titleRef = collector.add({ segment: titleSegment, text: sourceNotice.title, role: "title" });
  const fields = {
    title: field("present", sourceNotice.title, normalizeWhitespace(sourceNotice.title), [titleRef], 1),
  };

  const providerMatch = extractExplicitValue(safeSegments, ["제공기관", "지원기관", "주관기관", "재단"]);
  fields.provider = providerMatch
    ? field("present", providerMatch.raw, providerMatch.raw, [evidenceForMatch(collector, providerMatch, "provider")], 1)
    : field();
  const programMatch = extractExplicitValue(safeSegments, ["장학사업명", "장학금명", "프로그램명"]);
  fields.scholarship_program_name = programMatch
    ? field("present", programMatch.raw, programMatch.raw, [evidenceForMatch(collector, programMatch, "scholarship_program_name")], 1)
    : field();
  const cycleMatch = extractCycleLabel(safeSegments);
  fields.recruitment_cycle_label = cycleMatch
    ? field("present", cycleMatch.raw, cycleMatch.raw, [evidenceForMatch(collector, cycleMatch, "recruitment_cycle_label")], 0.98)
    : field();
  fields.academic_term = cycleMatch && /학기|상반기|하반기|봄|가을/u.test(cycleMatch.raw)
    ? field("present", cycleMatch.raw, normalizeIdentityText(cycleMatch.raw), fields.recruitment_cycle_label.evidence_refs, 0.98)
    : field();

  Object.assign(fields, resolveDateFields(safeSegments, collector, classification.value, reviewReasons, lowQualityInput));
  Object.assign(fields, resolveAmountFields(safeSegments, collector, reviewReasons, lowQualityInput));

  const eligibility = extractEligibility(safeSegments);
  const eligibilityRefs = eligibility.evidence.map((match) => evidenceForMatch(collector, match, "eligibility"));
  if (eligibility.complex) {
    fields.eligibility = field("ambiguous", eligibility.evidence.map((item) => item.line).join(" | "), null, eligibilityRefs, 0, ["complex_nested_eligibility"]);
    reviewReasons.add("complex_eligibility_unsupported");
  } else if (eligibility.conditions.length) {
    fields.eligibility = field("present", eligibility.evidence.map((item) => item.line).join(" | "), {
      operator: "and",
      conditions: eligibility.conditions,
    }, eligibilityRefs, 0.98);
  } else fields.eligibility = lowQualityInput ? field("unknown", null, null, [], 0, ["low_quality_input"]) : field();

  const requiredDocuments = extractRequiredDocuments(safeSegments);
  const documentRefs = requiredDocuments.evidence.map((match) => evidenceForMatch(collector, match, "required_documents"));
  fields.required_documents = requiredDocuments.values.length
    ? field("present", requiredDocuments.evidence.map((item) => item.line).join(" | "), requiredDocuments.values, documentRefs, 1)
    : field();
  const methods = extractApplicationMethods(safeSegments);
  const methodRefs = methods.evidence.map((match) => evidenceForMatch(collector, match, "application_method"));
  fields.application_method = methods.values.length
    ? field("present", methods.evidence.map((item) => item.line).join(" | "), methods.values, methodRefs, 1)
    : field();
  const url = extractApplicationUrl(safeSegments);
  fields.application_url = url
    ? field("present", url.raw, url.normalized, [evidenceForMatch(collector, url, "application_url")], 1)
    : field();
  const contacts = extractContacts(safeSegments);
  fields.contact = contacts.contacts.length
    ? field("present", contacts.contacts.join(" | "), contacts.contacts, contacts.evidence.map((match) => evidenceForMatch(collector, match, "contact")), 1)
    : field();
  const language = detectLanguage(allSegments.map((segment) => segment.text).join("\n"));
  fields.source_language = language ? field("present", language === "ko" ? "한국어" : "English", language, [titleRef], 1) : field("unknown", null, null, [], 0);
  if (classification.value.document_kind === "result_announcement") {
    fields.status = field("present", "선발 결과 발표", "result_announced", classification.value.evidence_refs, 1);
  } else if (classification.value.is_recruitment) {
    fields.status = field("present", "모집", "recruitment_notice", classification.value.evidence_refs, 0.95);
  } else fields.status = field("not_applicable");
  fields.notes = field();

  if (!providerMatch || !programMatch) reviewReasons.add("program_identity_insufficient");
  if (!cycleMatch) reviewReasons.add("cycle_identity_insufficient");
  if (sourceNotice.relationship_hints?.cross_source_required) reviewReasons.add("cross_source_relationship_requires_phase_5");
  if (sourceNotice.relationship_hints?.possible_repost) reviewReasons.add("possible_repost_requires_phase_5");
  if (sourceNotice.relationship_hints?.school_recommendation) reviewReasons.add("school_foundation_relationship_requires_phase_5");

  const programKey = providerMatch && programMatch
    ? `${normalizeIdentityText(providerMatch.raw)}|${normalizeIdentityText(programMatch.raw)}`
    : `unresolved|${sourceNotice.notice_id}`;
  const programCandidateId = `program_candidate_${sha256(programKey).slice(0, 24)}`;
  const programResolution = providerMatch && programMatch ? "proposed" : "unresolved";
  const programEvidence = [...new Set([
    ...(fields.provider.evidence_refs ?? []), ...(fields.scholarship_program_name.evidence_refs ?? []),
  ])];
  const cycleKey = cycleMatch ? `${programCandidateId}|${normalizeIdentityText(cycleMatch.raw)}` : `${programCandidateId}|unresolved|${sourceNotice.notice_id}`;
  const cycleCandidateId = `cycle_candidate_${sha256(cycleKey).slice(0, 24)}`;
  const cycleResolution = cycleMatch && programResolution === "proposed" ? "proposed" : "unresolved";
  const cycleEvidence = cycleMatch ? fields.recruitment_cycle_label.evidence_refs : [];

  const contentFingerprint = sha256(JSON.stringify({
    revision_id: sourceNotice.revision_id,
    title: normalizeWhitespace(sourceNotice.title),
    body: normalizeWhitespace(sourceNotice.body),
    documents: documents.map((document) => [document.document_revision_id, document.document_hash]).sort(),
  }));
  const required = reviewReasons.size > 0;
  const record = {
    schema_version: "engine-phase-4-canonical-scholarship/v1",
    record_type: "scholarship_extraction_candidate",
    classification: classification.value,
    source_notice_identity: {
      source_id: sourceNotice.source_id,
      source_key_snapshot: sourceNotice.source_key_snapshot,
      notice_id: sourceNotice.notice_id,
      identity_kind: sourceNotice.identity_kind,
      identity_key: sourceNotice.identity_key,
      canonical_url: sourceNotice.canonical_url,
    },
    source_documents: sourceDocumentsForRecord(documents),
    program_identity_candidate: {
      candidate_id: programCandidateId,
      candidate_key: programKey,
      resolution_status: programResolution,
      provider_normalized: providerMatch?.raw ?? null,
      name_normalized: programMatch?.raw ?? null,
      evidence_refs: programEvidence,
    },
    recruitment_cycle_identity_candidate: {
      candidate_id: cycleCandidateId,
      candidate_key: cycleKey,
      program_candidate_id: programCandidateId,
      resolution_status: cycleResolution,
      cycle_label: cycleMatch?.raw ?? null,
      evidence_refs: cycleEvidence,
    },
    opportunity_revision: {
      revision_id: sourceNotice.revision_id,
      cycle_candidate_id: cycleCandidateId,
      source_notice_id: sourceNotice.notice_id,
      source_document_revision_ids: documents.map((document) => document.document_revision_id),
      content_fingerprint: contentFingerprint,
      revision_ordinal: Number(sourceNotice.revision_ordinal ?? 1) || 1,
    },
    material_changes: [],
    fields,
    evidence: collector.values(),
    extraction_metadata: {
      extractor_name: DETERMINISTIC_EXTRACTOR_NAME,
      extractor_version: extractionContext.extractorVersion ?? DETERMINISTIC_EXTRACTOR_VERSION,
      model_provider: null,
      model_name: null,
      prompt_version: null,
      parser_contract_version: extractionContext.parserContractVersion ?? DOCUMENT_PARSING_CONTRACT_VERSION,
      evaluation_fixture_version: extractionContext.evaluationFixtureVersion ?? "engine-phase-4-deterministic-fixtures/v1",
      extracted_at: extractionContext.extractedAt,
    },
    validation: {
      status: required ? "review_required" : "valid",
      errors: [],
      warnings: [...reviewReasons].sort(),
    },
    review: {
      required,
      reason_codes: [...reviewReasons].sort(),
      automatic_publish_allowed: false,
      notification_allowed: false,
    },
  };
  return record;
}
