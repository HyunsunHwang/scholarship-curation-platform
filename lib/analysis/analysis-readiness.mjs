import { createHash } from "node:crypto";

export const ANALYSIS_KIND_SCHOLARSHIP_SEMANTIC = "scholarship_semantic_v1";
export const ANALYSIS_SCHEMA_VERSION = "scholarship-analysis-v1";
export const DEFAULT_PROMPT_VERSION = "scholarship-analysis-prompt-v1";
export const REDACTION_VERSION = "analysis-redaction-contract-v1";

export const READINESS_STATUSES = Object.freeze([
  "ready",
  "waiting_for_assets",
  "excluded_not_candidate",
  "excluded_result_or_roster",
  "excluded_multiple_programs",
  "excluded_low_text_quality",
  "excluded_privacy_risk",
  "blocked_missing_revision",
  "blocked_invalid_payload",
  "budget_deferred",
]);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function replacementCharRatio(text) {
  const value = String(text ?? "");
  if (!value) return 0;
  const bad = (value.match(/\uFFFD/g) ?? []).length;
  return bad / value.length;
}

function looksLikeRosterOrResult(text) {
  const value = clean(text).toLocaleLowerCase("ko-KR");
  return /(합격자|선발\s*결과|최종\s*합격|수혜자\s*명단|장학생\s*명단|합격\s*명단)/u.test(value);
}

function looksLikeMultiplePrograms(text) {
  const value = clean(text);
  const markers = value.match(/(모집\s*요강|지원\s*자격|신청\s*기간)/gu) ?? [];
  return markers.length >= 3 && /(①|②|1\.\s*모집|2\.\s*모집|유형\s*A|유형\s*B)/u.test(value);
}

function privacyRiskSignal(text) {
  const value = String(text ?? "");
  if (/\d{6}-\d{7}/.test(value)) return true;
  if (/\b\d{2,3}-\d{3,4}-\d{4}\b/.test(value)) return true;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) && /(명단|합격|수혜)/u.test(value)) return true;
  if (/(계좌번호|주민등록번호)/u.test(value)) return true;
  return false;
}

function assetExtractionState(assets = []) {
  const rows = Array.isArray(assets) ? assets : [];
  if (rows.length === 0) {
    return { has_attachments: false, extraction_pending: false, extracted_text_count: 0 };
  }
  let pending = 0;
  let extracted = 0;
  for (const asset of rows) {
    const status = clean(asset.extraction_status ?? asset.verification_status);
    const text = clean(asset.extracted_text ?? asset.extractedText ?? asset.metadata?.extracted_text);
    if (text) extracted += 1;
    else if (["pending", "queued", "processing", "metadata_only", ""].includes(status) || !status) {
      pending += 1;
    }
  }
  return {
    has_attachments: true,
    extraction_pending: pending > 0 && extracted < rows.length,
    extracted_text_count: extracted,
  };
}

/**
 * Pure deterministic readiness evaluator.
 * Does not call DB or LLM.
 */
export function evaluateAnalysisReadiness(input = {}) {
  const revision = input.revision ?? null;
  const notice = input.notice ?? {};
  const assets = input.assets ?? [];
  const source = input.source ?? {};
  const candidateClassification = clean(
    input.candidate_classification
      ?? notice.candidate_classification
      ?? revision?.normalized_payload?.candidate_classification,
  );
  const reasonCodes = [];

  if (!revision || !clean(revision.id)) {
    return {
      ready: false,
      status: "blocked_missing_revision",
      reason_codes: ["MISSING_REVISION"],
      input_profile: {
        has_body_text: false,
        has_attachment_text: false,
        korean_text_quality: "unknown",
        multiple_program_suspected: false,
        personal_data_risk: false,
      },
    };
  }

  const body = clean(revision.body ?? revision.raw_body ?? "");
  const title = clean(revision.title ?? notice.title ?? "");
  const combined = `${title}\n${body}`;
  const assetState = assetExtractionState(assets);
  const hasBodyText = body.length >= 80;
  const hasAttachmentText = assetState.extracted_text_count > 0;
  const lowQuality = replacementCharRatio(combined) >= 0.03 || body.length > 0 && body.length < 40;
  const rosterOrResult = looksLikeRosterOrResult(combined)
    || clean(input.document_type) === "result_or_roster";
  const multiplePrograms = Boolean(input.multiple_programs_suspected)
    || looksLikeMultiplePrograms(combined);
  const privacyRisk = Boolean(input.personal_data_risk) || privacyRiskSignal(combined);
  const scholarshipDedicated = Boolean(
    source.scholarship_dedicated
      ?? source.semantic_candidate_policy === "scholarship_dedicated"
      ?? input.scholarship_dedicated,
  );
  const noticeType = clean(input.notice_type ?? revision?.normalized_payload?.notice_type) || "unknown";

  const inputProfile = {
    has_body_text: hasBodyText,
    has_attachment_text: hasAttachmentText,
    korean_text_quality: lowQuality ? "poor" : (hasBodyText || hasAttachmentText ? "good" : "insufficient"),
    multiple_program_suspected: multiplePrograms,
    personal_data_risk: privacyRisk,
    candidate_classification: candidateClassification || null,
    scholarship_dedicated: scholarshipDedicated,
    notice_type: noticeType,
    attachment_count: Array.isArray(assets) ? assets.length : 0,
    attachment_extraction_pending: assetState.extraction_pending,
  };

  if (["not_candidate", "out_of_range"].includes(candidateClassification)
    && !scholarshipDedicated) {
    return {
      ready: false,
      status: "excluded_not_candidate",
      reason_codes: ["NOT_SCHOLARSHIP_CANDIDATE"],
      input_profile: inputProfile,
    };
  }

  if (rosterOrResult || noticeType === "result_or_roster") {
    return {
      ready: false,
      status: "excluded_result_or_roster",
      reason_codes: ["RESULT_OR_ROSTER_NOTICE"],
      input_profile: inputProfile,
    };
  }

  if (privacyRisk) {
    return {
      ready: false,
      status: "excluded_privacy_risk",
      reason_codes: ["PERSONAL_DATA_RISK"],
      input_profile: inputProfile,
    };
  }

  if (multiplePrograms) {
    return {
      ready: false,
      status: "excluded_multiple_programs",
      reason_codes: ["MULTIPLE_PROGRAMS_SUSPECTED"],
      input_profile: inputProfile,
    };
  }

  if (assetState.has_attachments && assetState.extraction_pending && !hasBodyText) {
    return {
      ready: false,
      status: "waiting_for_assets",
      reason_codes: ["ATTACHMENT_EXTRACTION_PENDING"],
      input_profile: inputProfile,
    };
  }

  // Conservative: attachments exist, extraction pending, body exists but short of "sufficient"
  // and attachment likely carries conditions.
  if (assetState.has_attachments && assetState.extraction_pending && body.length < 200) {
    return {
      ready: false,
      status: "waiting_for_assets",
      reason_codes: ["ATTACHMENT_MAY_CONTAIN_CONDITIONS"],
      input_profile: inputProfile,
    };
  }

  if (lowQuality) {
    return {
      ready: false,
      status: "excluded_low_text_quality",
      reason_codes: ["LOW_KOREAN_TEXT_QUALITY"],
      input_profile: inputProfile,
    };
  }

  if (!hasBodyText && !hasAttachmentText) {
    return {
      ready: false,
      status: "blocked_invalid_payload",
      reason_codes: ["NO_USABLE_TEXT"],
      input_profile: inputProfile,
    };
  }

  if (input.budget_deferred === true) {
    return {
      ready: false,
      status: "budget_deferred",
      reason_codes: ["BUDGET_DEFERRED"],
      input_profile: inputProfile,
    };
  }

  if (noticeType && noticeType !== "unknown" && noticeType !== "new_recruitment") {
    reasonCodes.push("NOTICE_TYPE_NOT_NEW_RECRUITMENT");
  }

  return {
    ready: true,
    status: "ready",
    reason_codes: reasonCodes,
    input_profile: inputProfile,
  };
}

export function canonicalizeJson(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => canonicalizeJson(item));
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalizeJson(value[key])]),
  );
}

export function fingerprintJson(value) {
  return sha256(JSON.stringify(canonicalizeJson(value)));
}

export function buildAnalysisInputFingerprint({
  revision,
  assets = [],
  source = {},
  redactionVersion = REDACTION_VERSION,
} = {}) {
  const attachmentTextHashes = (Array.isArray(assets) ? assets : [])
    .map((asset) => ({
      original_url_hash: clean(asset.original_url_hash ?? asset.originalUrlHash),
      extracted_text_hash: sha256(clean(asset.extracted_text ?? asset.extractedText ?? "")),
    }))
    .sort((left, right) => left.original_url_hash.localeCompare(right.original_url_hash));

  return fingerprintJson({
    revision_id: clean(revision?.id),
    notice_id: clean(revision?.notice_id ?? source.notice_id),
    canonical_url: clean(revision?.canonical_url ?? source.canonical_url),
    body_hash: sha256(clean(revision?.body ?? "")),
    title_hash: sha256(clean(revision?.title ?? "")),
    attachment_text_hashes: attachmentTextHashes,
    source_id: clean(source.source_id ?? source.sourceId),
    redaction_version: redactionVersion,
  });
}

export function buildAnalysisJobIdempotencyKey({
  revisionId,
  analysisKind = ANALYSIS_KIND_SCHOLARSHIP_SEMANTIC,
  promptVersion = DEFAULT_PROMPT_VERSION,
  schemaVersion = ANALYSIS_SCHEMA_VERSION,
  inputFingerprint,
} = {}) {
  return [
    clean(revisionId),
    clean(analysisKind),
    clean(promptVersion),
    clean(schemaVersion),
    clean(inputFingerprint),
  ].join("|");
}

export function buildAnalysisResultFingerprint({
  structuredResult,
  schemaVersion = ANALYSIS_SCHEMA_VERSION,
} = {}) {
  return fingerprintJson({
    schema_version: schemaVersion,
    structured_result: structuredResult ?? {},
  });
}

export function emptyScholarshipAnalysisEnvelope(schemaVersion = ANALYSIS_SCHEMA_VERSION) {
  return {
    schema_version: schemaVersion,
    document_classification: {
      notice_type: null,
      is_scholarship: null,
      multiple_programs_suspected: null,
    },
    fields: {
      title: null,
      provider_name: null,
      application_start_date: null,
      application_end_date: null,
      eligibility: [],
      benefit: [],
      required_documents: [],
      application_method: [],
      contact: [],
    },
    risk_flags: [],
    proposal: {
      program: null,
      cycle: null,
    },
  };
}
