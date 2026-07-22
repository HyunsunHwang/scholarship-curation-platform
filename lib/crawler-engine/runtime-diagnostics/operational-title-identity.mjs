function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stripBracketedNoticeLabel(match, label) {
  const text = clean(label).toLowerCase();
  return /^(?:notice|new|공지|공고|안내|알림|장학|학부|대학원|일반|중요|모집)$/u.test(text)
    ? " "
    : ` ${text} `;
}

/**
 * Removes presentation-only notice prefixes without removing meaningful bracketed
 * title content such as "[학부생] 지원 안내".
 */
export function stripOperationalNoticePrefix(value) {
  let current = clean(value);
  for (let pass = 0; pass < 8; pass += 1) {
    const next = current
      .replace(/^\d+[.)]\s*/u, "")
      .replace(/^(?:new|n|신규)\s+/iu, "")
      .replace(/^(?:all|공통|국제|서울)\s+/iu, "")
      .replace(/^(?:제목|subject|title)\s*[:：]\s*/iu, "")
      .replace(/^\[(?:(?:notice|공지|공고|일반공지|장학|학부|대학원|모집)(?:\s+(?:notice|공지|공고|일반공지|장학|학부|대학원|모집))*)\]\s*/iu, "")
      .replace(/^(?:notice|공지|일반공지|장학공지|장학|모집)\s+/iu, "")
      .trim();
    if (next === current) break;
    current = next;
  }
  return current;
}

export function normalizeOperationalTitleForIdentity(value) {
  return clean(value)
    .toLowerCase()
    .replace(/\[([^\]]*)\]/gu, stripBracketedNoticeLabel)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(?:notice|공지|공고|장학|scholarship)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSegments(value) {
  return clean(value)
    .split(/\s*(?:\||>|::| - | — | – )\s*/u)
    .map((segment) => normalizeOperationalTitleForIdentity(stripOperationalNoticePrefix(segment)))
    .filter((segment) => segment.length >= 4);
}

/** Pure list/detail identity verification used by the generic detail parser and diagnostics. */
export function verifyOperationalDetailTitleIdentity(listTitle, detailTitleCandidates = []) {
  const normalizedListTitle = normalizeOperationalTitleForIdentity(listTitle);
  const normalizedStrippedListTitle = normalizeOperationalTitleForIdentity(
    stripOperationalNoticePrefix(listTitle),
  );
  if (normalizedListTitle.length < 4) {
    return {
      verified: false,
      status: "title_unavailable",
      comparison_mode: "title_unavailable",
      matched_title: "",
    };
  }

  for (const rawCandidate of detailTitleCandidates) {
    const candidate = clean(rawCandidate);
    const normalizedCandidate = normalizeOperationalTitleForIdentity(candidate);
    const normalizedStrippedCandidate = normalizeOperationalTitleForIdentity(
      stripOperationalNoticePrefix(candidate),
    );
    if (normalizedCandidate.length < 4) continue;
    if (normalizedCandidate === normalizedListTitle) {
      return { verified: true, status: "title_match", comparison_mode: "normalized_exact", matched_title: candidate };
    }
    if (normalizedStrippedCandidate && normalizedStrippedCandidate === normalizedStrippedListTitle) {
      return { verified: true, status: "title_match", comparison_mode: "notice_prefix_stripped_exact", matched_title: candidate };
    }
    if (titleSegments(candidate).some((segment) => segment === normalizedListTitle || segment === normalizedStrippedListTitle)) {
      return { verified: true, status: "title_match", comparison_mode: "detail_title_segment_match", matched_title: candidate };
    }
  }

  return {
    verified: false,
    status: Array.isArray(detailTitleCandidates) && detailTitleCandidates.some((value) => clean(value))
      ? "title_mismatch"
      : "detail_title_unavailable",
    comparison_mode: "title_mismatch",
    matched_title: "",
  };
}
