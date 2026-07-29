const DEFAULT_MAX_SEGMENT_LENGTH = 700;

function boundaryBefore(text, index) {
  const before = text.slice(0, index);
  const sentence = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"));
  const whitespace = before.search(/\s+[^\s]*$/u);
  if (sentence >= Math.max(0, index - 260)) return sentence + 1;
  if (whitespace >= Math.max(0, index - 180)) return whitespace + 1;
  return index;
}

/**
 * Split the original body into contiguous raw spans.  The segments deliberately
 * retain every character (including crawler-normalized whitespace): offsets can
 * therefore reconstruct the exact input body without a lossy join operation.
 */
export function segmentNoticeBody(bodyText, { maxSegmentLength = DEFAULT_MAX_SEGMENT_LENGTH } = {}) {
  const body = String(bodyText ?? "");
  if (!body) return [];
  const boundaries = new Set([0, body.length]);
  // A numbered heading must be followed by a textual heading label. This avoids
  // treating the dots inside Korean dates (for example, "2026. 7. 1.") as breaks.
  for (const match of body.matchAll(/(?<=[.!?])(?=\s*(?:(?:\d{1,2}\.|[가-하]\.)\s*[가-힣A-Za-z]|\[|▶|❍|※))/gu)) boundaries.add(match.index);

  const structural = [...boundaries].sort((left, right) => left - right);
  const spans = [];
  for (let index = 0; index < structural.length - 1; index += 1) {
    let start = structural[index];
    const end = structural[index + 1];
    while (end - start > maxSegmentLength) {
      let boundary = boundaryBefore(body, Math.min(start + maxSegmentLength, end));
      if (boundary <= start) boundary = Math.min(start + maxSegmentLength, end);
      spans.push([start, boundary]);
      start = boundary;
    }
    if (end > start) spans.push([start, end]);
  }
  return spans.map(([start_offset, end_offset], index) => ({
    segment_id: `S${String(index + 1).padStart(3, "0")}`,
    text: body.slice(start_offset, end_offset),
    start_offset,
    end_offset,
    segment_type: /^\s*(?:\d+\.|[가-하]\.)/u.test(body.slice(start_offset, end_offset)) ? "section" : "paragraph",
  }));
}

export function validateNoticeSegments(bodyText, segments) {
  const body = String(bodyText ?? "");
  const errors = [];
  const ids = new Set();
  let cursor = 0;
  for (const segment of segments ?? []) {
    if (!/^S\d{3,}$/u.test(String(segment?.segment_id ?? "")) || ids.has(segment?.segment_id)) errors.push(`invalid_or_duplicate_segment_id:${segment?.segment_id ?? "unknown"}`);
    ids.add(segment?.segment_id);
    if (!Number.isInteger(segment?.start_offset) || !Number.isInteger(segment?.end_offset) || segment.start_offset !== cursor || segment.end_offset <= segment.start_offset || segment.end_offset > body.length) errors.push(`invalid_offset:${segment?.segment_id ?? "unknown"}`);
    if (body.slice(segment?.start_offset, segment?.end_offset) !== segment?.text) errors.push(`segment_text_mismatch:${segment?.segment_id ?? "unknown"}`);
    cursor = segment?.end_offset;
  }
  if (cursor !== body.length) errors.push("segment_coverage_mismatch");
  return { valid: errors.length === 0, errors, reconstruction: (segments ?? []).map((segment) => segment.text).join("") };
}
