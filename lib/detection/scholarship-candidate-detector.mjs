export const SCHOLARSHIP_CANDIDATE_POLICY_VERSION = "scholarship-candidate-policy-v1";

export const DEFAULT_SCHOLARSHIP_KEYWORDS = Object.freeze([
  "장학",
  "장학금",
  "학자금",
  "등록금",
  "scholarship",
  "tuition",
  "financial aid",
]);

const ENGLISH_MONTHS = new Map(
  [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ].map((month, index) => [month, index + 1]),
);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function validUtcDate(year, month, day) {
  if (![year, month, day].every(Number.isFinite)) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function parseScholarshipNoticeDate(rawText) {
  const text = clean(rawText);
  if (!text) return null;

  const numericPatterns = [
    /(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/,
    /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/,
    /(\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/,
  ];
  for (const pattern of numericPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    let year = Number(match[1]);
    if (year < 100) year += 2000;
    const parsed = validUtcDate(year, Number(match[2]), Number(match[3]));
    if (parsed) return parsed;
  }

  const englishPatterns = [
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/i,
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s+(\d{4})\b/i,
  ];
  for (const [index, pattern] of englishPatterns.entries()) {
    const match = text.match(pattern);
    if (!match) continue;
    const monthText = index === 0 ? match[1] : match[2];
    const day = Number(index === 0 ? match[2] : match[1]);
    const month = ENGLISH_MONTHS.get(monthText.slice(0, 3).toLowerCase());
    const parsed = validUtcDate(Number(match[3]), month, day);
    if (parsed) return parsed;
  }
  return null;
}

export function isScholarshipNoticeWithinLookback(
  parsedDate,
  lookbackDays,
  now = new Date(),
) {
  if (!(parsedDate instanceof Date) || Number.isNaN(parsedDate.getTime())) return false;
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(current.getTime())) throw new TypeError("now must be a valid date");
  const days = Math.max(0, Number(lookbackDays) || 0);
  const minimum = new Date(current.getTime() - days * 24 * 60 * 60 * 1000);
  return parsedDate >= minimum && parsedDate <= current;
}

function uniqueKeywords(keywords) {
  const seen = new Set();
  return (Array.isArray(keywords) ? keywords : DEFAULT_SCHOLARSHIP_KEYWORDS)
    .map(clean)
    .filter((keyword) => {
      const key = keyword.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function collectAttachmentText(observation) {
  const attachments = observation?.attachmentMetadata ?? observation?.attachment_metadata;
  if (!Array.isArray(attachments)) return "";
  return attachments.map((item) => [
    item?.name, item?.filename, item?.file_name, item?.title, item?.text,
  ].map(clean).filter(Boolean).join(" ")).filter(Boolean).join(" ");
}

function matchKeywordLocations(observation, keywords) {
  const fields = [
    ["title", clean(observation?.title)],
    ["detail_title", clean(observation?.detailTitle ?? observation?.detail_title)],
    ["body", clean(observation?.content ?? observation?.body)],
    ["attachment", collectAttachmentText(observation)],
    ["ocr", clean(observation?.ocrText ?? observation?.ocr_text)],
  ];
  const matchedKeywords = new Set();
  const matchedLocations = [];
  for (const [location, value] of fields) {
    if (!value) continue;
    const normalized = value.toLowerCase();
    let locationMatched = false;
    for (const keyword of keywords) {
      if (!normalized.includes(keyword.toLowerCase())) continue;
      matchedKeywords.add(keyword);
      locationMatched = true;
    }
    if (locationMatched) matchedLocations.push(location);
  }
  return {
    matchedKeywords: [...matchedKeywords],
    matchedLocations,
    primaryMatched: matchedLocations.includes("title") || matchedLocations.includes("detail_title"),
  };
}

function resolveDateEvidence(observation, stage) {
  const candidates = stage === "preliminary"
    ? [
        ["dateText", observation?.dateText ?? observation?.date_text, true],
        ["title", observation?.title, false],
      ]
    : [
        ["detailDate", observation?.detailDate ?? observation?.detail_date, true],
        ["dateText", observation?.dateText ?? observation?.date_text, true],
        ["title", observation?.title, false],
      ];
  let firstNonEmpty = null;
  for (const [field, value, dedicatedDateField] of candidates) {
    const rawValue = clean(value);
    if (!rawValue) continue;
    const parsed = parseScholarshipNoticeDate(rawValue);
    if (parsed) return { field, rawValue, parsed };
    if (dedicatedDateField) firstNonEmpty ??= { field, rawValue };
  }
  return { ...(firstNonEmpty ?? { field: null, rawValue: null }), parsed: null };
}

export function detectScholarshipCandidate(
  observation,
  {
    keywords = DEFAULT_SCHOLARSHIP_KEYWORDS,
    lookbackDays = 31,
    allowUndated = false,
    now = new Date(),
    stage = "final",
  } = {},
) {
  const normalizedStage = stage === "preliminary" ? "preliminary" : "final";
  const keywordList = uniqueKeywords(keywords);
  const title = clean(observation?.title);
  const detailTitle = clean(observation?.detailTitle ?? observation?.detail_title);
  const titleEvaluable = Boolean(title || (normalizedStage === "final" && detailTitle));
  const keywordEvidence = matchKeywordLocations(observation, keywordList);
  const dateEvidence = resolveDateEvidence(observation, normalizedStage);
  const base = {
    observationId: clean(observation?.observationId ?? observation?.observation_id) || null,
    sourceId: clean(observation?.sourceId ?? observation?.source_id) || null,
    noticeUrl: clean(observation?.noticeUrl ?? observation?.notice_url) || null,
    stage: normalizedStage,
    classification: "undetermined",
    eligibleForDetailFetch: true,
    eligibleForDownstream: false,
    keywordResult: {
      evaluated: titleEvaluable,
      matched: keywordEvidence.primaryMatched,
      matchedKeywords: keywordEvidence.matchedKeywords,
      matchedLocations: keywordEvidence.matchedLocations,
    },
    dateResult: {
      status: dateEvidence.rawValue ? "invalid" : (allowUndated ? "missing_allowed" : "missing_disallowed"),
      rawValue: dateEvidence.rawValue,
      parsedValue: dateEvidence.parsed?.toISOString().slice(0, 10) ?? null,
    },
    reasonCodes: [],
    policyVersion: SCHOLARSHIP_CANDIDATE_POLICY_VERSION,
  };

  if (!titleEvaluable) {
    base.reasonCodes.push("candidate_title_unavailable");
    return base;
  }
  if (!keywordEvidence.primaryMatched) {
    base.classification = "not_candidate";
    base.eligibleForDetailFetch = false;
    base.reasonCodes.push(
      keywordEvidence.matchedLocations.length > 0
        ? "keyword_only_outside_title"
        : "scholarship_keyword_not_found",
    );
    return base;
  }
  if (dateEvidence.parsed) {
    const withinRange = isScholarshipNoticeWithinLookback(dateEvidence.parsed, lookbackDays, now);
    base.dateResult.status = withinRange ? "within_range" : "out_of_range";
    base.classification = withinRange ? "candidate" : "out_of_range";
    base.eligibleForDetailFetch = withinRange;
    base.eligibleForDownstream = withinRange;
    base.reasonCodes.push(withinRange ? "keyword_and_date_within_range" : "candidate_date_out_of_range");
    return base;
  }
  if (!dateEvidence.rawValue && allowUndated) {
    base.classification = "candidate";
    base.eligibleForDetailFetch = true;
    base.eligibleForDownstream = true;
    base.reasonCodes.push("keyword_match_undated_allowed");
    return base;
  }
  if (!dateEvidence.rawValue && normalizedStage === "final") {
    base.classification = "out_of_range";
    base.eligibleForDetailFetch = false;
    base.reasonCodes.push("candidate_date_missing_disallowed");
    return base;
  }
  base.reasonCodes.push(
    dateEvidence.rawValue ? "candidate_date_invalid" : "candidate_date_missing_requires_detail",
  );
  return base;
}

export function summarizeScholarshipCandidateResults(results) {
  const rows = Array.isArray(results) ? results : [];
  const count = (classification) =>
    rows.filter((result) => result?.classification === classification).length;
  return {
    candidate_count: count("candidate"),
    not_candidate_count: count("not_candidate"),
    out_of_range_count: count("out_of_range"),
    undetermined_count: count("undetermined"),
    detection_error_count: rows.filter((result) =>
      result?.reasonCodes?.includes("candidate_title_unavailable")
      || result?.reasonCodes?.includes("candidate_date_invalid")).length,
  };
}
