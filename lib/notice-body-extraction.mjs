import { load as loadHtml } from "cheerio";

// ─────────────────────────────────────────────────────────────────
// 공지 상세 HTML → 본문 텍스트 / 이미지 URL 추출 (크롤러·AI 초안 공유)
// ─────────────────────────────────────────────────────────────────

const BODY_KEYWORDS = [
  "장학",
  "신청",
  "지원",
  "마감",
  "선발",
  "제출",
  "자격",
  "대상",
  "기간",
  "서류",
];

const MENU_HINTS = [
  "사이트맵",
  "로그인",
  "검색",
  "메뉴",
  "학과소개",
  "공지사항",
  "전체공지",
  "rss",
  "본문 바로가기",
  "주메뉴 바로가기",
  "킹고id",
  "kingogpt",
];

/** 본문일 가능성이 높은 영역 (우선 탐색) */
const PREFERRED_CONTENT_SELECTORS = [
  ".board-write-box",
  ".boardView_txtWrap",
  ".board-view-content",
  ".board_view_con",
  ".view-content",
  ".view_cont",
  ".view-con",
  ".article-content",
  ".article_view",
  ".entry-content",
  ".post-content",
  ".fr-view",
  ".xe_content",
  ".bo_v_con",
  ".tbl_view",
  "#bbs_content",
  ".board_view",
  ".board-view",
  ".board-content",
  "article",
  "main",
  "#content",
  "#contents",
  ".content",
  ".contents",
  ".conts",
];

const SOURCE_DETAIL_CONTENT_SELECTORS = {
  cau_011: ["#bo_v_con"],
  cau_013: [".entry-content"],
};

const ICON_URL_RE =
  /(?:icon|logo|sprite|btn|button|banner_?top|spacer|blank|loading|favicon|emoji|avatar|profile|sns|share|print|rss|\/_res\/|skku_s\.png|\/common\/img\/|\/img\/common\/)/i;
const ATTACHMENT_EXTENSION_RE = /\.((?:pdf|docx?|xlsx?|pptx?|hwp|hwpx|zip|txt|csv))(?:$|[?#])/i;
const ATTACHMENT_HINT_RE = /(?:attach|attachment|download|file|첨부)/i;

/** 인라인 필드용: URL·셀렉터·짧은 라벨 등 (기존과 동일하게 공백만 붕괴) */
function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function prepareRawText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .normalize("NFC");
}

/**
 * 줄바꿈·Markdown 표 구조만 유지 (인코딩 정리는 analyzeDetailTextQuality에서 수행).
 */
function preserveLineBreaks(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 본문용: 인코딩 정리 + 줄바꿈 보존.
 * (기존 cleanText는 표를 한 줄로 붕괴시킴)
 */
export function normalizeBodyText(value) {
  return preserveLineBreaks(prepareRawText(value));
}

function escapeMarkdownCell(value) {
  return cleanText(value).replace(/\|/g, "\\|");
}

function directTableRows($, table) {
  return $(table)
    .find("tr")
    .filter((_, el) => $(el).closest("table").get(0) === table)
    .toArray();
}

function cellPlainText($, cell) {
  const clone = $(cell).clone();
  clone.find("table").remove();
  clone.find("br").replaceWith("\n");
  return escapeMarkdownCell(clone.text().replace(/\s*\n\s*/g, " "));
}

/**
 * rowspan/colspan을 펼친 2차원 격자.
 * 병합 원점 셀에만 텍스트를 두고 나머지는 빈 칸으로 둔다.
 */
export function htmlTableToMatrix($, table) {
  const rows = directTableRows($, table);
  const matrix = [];

  for (let r = 0; r < rows.length; r += 1) {
    if (!matrix[r]) matrix[r] = [];
    let c = 0;
    const cells = $(rows[r]).children("th, td").toArray();
    for (const cell of cells) {
      while (matrix[r][c] !== undefined) c += 1;
      const colspan = Math.max(1, Number.parseInt($(cell).attr("colspan") || "1", 10) || 1);
      const rowspan = Math.max(1, Number.parseInt($(cell).attr("rowspan") || "1", 10) || 1);
      const text = cellPlainText($, cell);
      for (let dr = 0; dr < rowspan; dr += 1) {
        for (let dc = 0; dc < colspan; dc += 1) {
          if (!matrix[r + dr]) matrix[r + dr] = [];
          matrix[r + dr][c + dc] = dr === 0 && dc === 0 ? text : "";
        }
      }
      c += colspan;
    }
  }

  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  for (const row of matrix) {
    while (row.length < width) row.push("");
    for (let i = 0; i < width; i += 1) {
      if (row[i] === undefined) row[i] = "";
    }
  }
  return matrix;
}

export function matrixToMarkdown(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) return "";
  const width = matrix[0]?.length ?? 0;
  if (width < 2) return "";
  const hasContent = matrix.some((row) => row.some((cell) => cleanText(cell)));
  if (!hasContent) return "";

  const formatRow = (row) =>
    `| ${row.map((cell) => (cleanText(cell) ? cleanText(cell) : " ")).join(" | ")} |`;
  const lines = [formatRow(matrix[0]), `| ${Array.from({ length: width }, () => "---").join(" | ")} |`];
  for (let i = 1; i < matrix.length; i += 1) {
    lines.push(formatRow(matrix[i]));
  }
  return lines.join("\n");
}

function isLikelyLayoutTable($, table, matrix) {
  const role = cleanText($(table).attr("role")).toLowerCase();
  if (role === "presentation" || role === "none") return true;

  const width = matrix[0]?.length ?? 0;
  if (width < 2) return true;
  if (matrix.length > 40) return true;

  const cells = matrix.flat().map((cell) => cleanText(cell)).filter(Boolean);
  if (cells.length === 0) return true;
  const avgLen = cells.reduce((sum, cell) => sum + cell.length, 0) / cells.length;
  // 긴 문단이 많은 대형 표는 레이아웃용일 가능성이 큼
  if (avgLen > 220 && matrix.length > 8) return true;
  return false;
}

export function htmlTableToMarkdown($, table) {
  const matrix = htmlTableToMatrix($, table);
  if (isLikelyLayoutTable($, table, matrix)) return "";
  return matrixToMarkdown(matrix);
}

/** 깊은 표부터 Markdown 텍스트로 치환. 레이아웃 표는 건너뛴다. */
export function replaceTablesWithMarkdown($) {
  const tables = $("table")
    .toArray()
    .sort(
      (a, b) =>
        $(b).parents("table").length - $(a).parents("table").length,
    );
  let converted = 0;
  for (const table of tables) {
    const markdown = htmlTableToMarkdown($, table);
    if (!markdown) continue;
    $(table).replaceWith(`\n\n${markdown}\n\n`);
    converted += 1;
  }
  return converted;
}

export function getSourceSpecificDetailContentSelectors(sourceId) {
  return SOURCE_DETAIL_CONTENT_SELECTORS[cleanText(sourceId).toLowerCase()] ?? [];
}

export function resolveAbsoluteUrl(value, baseUrl) {
  const input = cleanText(value);
  if (!input) return "";
  if (/^javascript:/i.test(input)) return "";
  if (/^data:/i.test(input)) return "";
  if (/^#/.test(input)) return "";
  try {
    const resolved = new URL(input, baseUrl || undefined);
    if (resolved.protocol === "http:") resolved.protocol = "https:";
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") {
      return "";
    }
    return resolved.toString();
  } catch {
    return "";
  }
}

function scoreTextContent(text, linkText, preferredBoost = 0) {
  const textLen = text.length;
  if (textLen < 80) return -1;
  const linkLen = linkText.length;
  const linkDensity = Math.min(1, linkLen / Math.max(1, textLen));
  const keywordHits = BODY_KEYWORDS.reduce(
    (count, keyword) => count + (text.includes(keyword) ? 1 : 0),
    0,
  );
  const menuHits = MENU_HINTS.reduce(
    (count, keyword) =>
      count + (text.toLowerCase().includes(keyword.toLowerCase()) ? 1 : 0),
    0,
  );
  const sentenceLike = (text.match(/[.!?\n]|다\.|요\.|니다\./g) ?? []).length;
  return (
    Math.min(textLen, 4000) * (1 - linkDensity) +
    keywordHits * 280 +
    sentenceLike * 8 +
    preferredBoost -
    menuHits * 180 -
    linkDensity * 800
  );
}

function collectCandidateTexts($, selector, preferredBoost = 0) {
  const out = [];
  $(selector).each((index, node) => {
    if (index > 60) return false;
    const root = $(node);
    // 인코딩 정리는 quality 단계에서 수행해 개선 여부를 감지할 수 있게 둔다
    const text = preserveLineBreaks(root.text());
    if (text.length < 80) return undefined;
    const linkText = cleanText(root.find("a").text());
    const score = scoreTextContent(text, linkText, preferredBoost);
    if (score > 0) {
      out.push({ text, score, node, selector });
    }
    return undefined;
  });
  return out;
}

/**
 * 상세 HTML에서 본문 텍스트를 고른다.
 * preferred 셀렉터 후보가 있으면 body 전체보다 우선한다.
 */
export function pickBestCandidateText($) {
  const preferred = [];
  for (const selector of PREFERRED_CONTENT_SELECTORS) {
    preferred.push(...collectCandidateTexts($, selector, 320));
  }
  preferred.sort((a, b) => b.score - a.score);

  const loose = collectCandidateTexts($, "section, div, td", 0);
  const ogDescription = cleanText(
    $('meta[property="og:description"]').attr("content") ?? "",
  );
  if (ogDescription.length >= 60) {
    loose.push({
      text: ogDescription,
      score: scoreTextContent(ogDescription, "", 180),
      node: null,
      selector: "og:description",
    });
  }

  const bodyText = preserveLineBreaks($("body").text());
  if (bodyText.length >= 120) {
    loose.push({
      text: bodyText,
      score: scoreTextContent(bodyText, cleanText($("body a").text()), -400),
      node: null,
      selector: "body",
    });
  }
  loose.sort((a, b) => b.score - a.score);

  const bestPreferred = preferred[0];
  const bestLoose = loose[0];

  // preferred가 충분히 길면 메뉴가 섞인 body보다 우선
  if (bestPreferred && bestPreferred.text.length >= 100) {
    if (
      !bestLoose ||
      bestPreferred.score >= bestLoose.score * 0.55 ||
      bestLoose.selector === "body"
    ) {
      return bestPreferred.text.slice(0, 12000);
    }
  }

  return (bestPreferred?.text ?? bestLoose?.text ?? "").slice(0, 12000);
}

/**
 * 본문 영역(또는 전체)에서 이미지 절대 URL 목록을 뽑는다.
 */
function pickImageScope($, rootSelector) {
  const preferred = cleanText(rootSelector);
  if (preferred) {
    const roots = $(preferred);
    if (roots.length > 0) return roots;
  }
  for (const selector of PREFERRED_CONTENT_SELECTORS) {
    const set = $(selector);
    if (set.length > 0) return set.first();
  }
  return $("body");
}

export function extractNoticeImageUrls($, baseUrl, options = {}) {
  const max = Math.max(1, Number(options.max ?? 20));
  const scope = pickImageScope($, options.rootSelector);

  const urls = [];
  const seen = new Set();

  const pushUrl = (raw) => {
    const absolute = resolveAbsoluteUrl(raw, baseUrl);
    if (!absolute) return;
    if (seen.has(absolute)) return;
    if (ICON_URL_RE.test(absolute)) return;
    // 1x1 / tracking 흔한 패턴
    if (/[?&](w|h|width|height)=1\b/i.test(absolute)) return;
    seen.add(absolute);
    urls.push(absolute);
  };

  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) pushUrl(ogImage);

  scope.find("img").each((_, el) => {
    if (urls.length >= max) return false;
    const node = $(el);
    const src =
      node.attr("src") ||
      node.attr("data-src") ||
      node.attr("data-original") ||
      node.attr("data-lazy-src") ||
      "";
    pushUrl(src);
    const srcset = node.attr("srcset") || node.attr("data-srcset") || "";
    if (srcset) {
      const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
      if (first) pushUrl(first);
    }
    return undefined;
  });

  return urls.slice(0, max);
}

function attachmentFileName(url, label) {
  try {
    const pathname = new URL(url).pathname;
    const candidate = pathname.split("/").filter(Boolean).at(-1) ?? "";
    if (candidate && !/^download$/i.test(candidate)) return decodeURIComponent(candidate);
  } catch {}
  return cleanText(label);
}

function attachmentExtension(fileName, url) {
  const match = `${fileName} ${url}`.match(ATTACHMENT_EXTENSION_RE);
  return match?.[1]?.toLowerCase() ?? "";
}

export function extractNoticeAttachmentMetadata($, baseUrl, options = {}) {
  const max = Math.max(1, Number(options.max ?? 20));
  const records = [];
  const seen = new Set();
  $("a[href], a[data-download], a[data-file]").each((_, element) => {
    if (records.length >= max) return false;
    const node = $(element);
    const rawUrl = node.attr("href") || node.attr("data-download") || node.attr("data-file") || "";
    const url = resolveAbsoluteUrl(rawUrl, baseUrl);
    const label = cleanText(node.text() || node.attr("title") || node.attr("aria-label") || "");
    const className = cleanText(node.attr("class") || "");
    const fileName = attachmentFileName(url, label);
    const extension = attachmentExtension(fileName, url);
    const mimeLikeHint = cleanText(node.attr("type") || node.attr("data-file-type") || node.attr("data-mime") || "");
    if (!url || seen.has(url)) return undefined;
    if (!extension && !ATTACHMENT_HINT_RE.test(`${rawUrl} ${label} ${className} ${mimeLikeHint}`)) return undefined;
    seen.add(url);
    records.push({
      url,
      fileName,
      extension,
      mimeLikeHint: mimeLikeHint || null,
      relation: "detail_page",
      label: label || null,
    });
    return undefined;
  });
  return records;
}

export function analyzeDetailTextQuality(value) {
  const originalText = String(value ?? "");
  const collapsedRaw = cleanText(originalText);
  const collapsedPrepared = cleanText(prepareRawText(originalText));
  const normalizedText = normalizeBodyText(originalText);
  const replacementCharacterCount = (normalizedText.match(/\ufffd/g) ?? []).length;
  const mojibakeMarkerCount = (normalizedText.match(/(?:Ã.|Â.|â..)/g) ?? []).length;
  const bodyReplacementCharacterRatio = replacementCharacterCount / Math.max(1, normalizedText.length);
  return {
    normalizedText,
    replacementCharacterCount,
    bodyReplacementCharacterRatio,
    encodingOrMojibakeSuspected: replacementCharacterCount > 0 || mojibakeMarkerCount > 0,
    // 인코딩 개선 여부는 줄바꿈 보존과 무관하게 collapse 기준으로 판정
    encodingNormalizationApplied: collapsedPrepared !== collapsedRaw,
    encodingNormalizationImproved:
      collapsedPrepared !== collapsedRaw && replacementCharacterCount === 0,
  };
}

export function evaluateDetailQualitySignals(detail = {}) {
  const text = analyzeDetailTextQuality(detail.content);
  const attachments = Array.isArray(detail.attachmentMetadata) ? detail.attachmentMetadata : [];
  const imageUrls = Array.isArray(detail.imageUrls) ? detail.imageUrls : [];
  const bodyTextLength = text.normalizedText.length;
  const shortBodySuspected = bodyTextLength < 120;
  const attachmentOnlyPossible = Boolean(detail.attachmentOnlyPossible) || (
    attachments.length === 0 && bodyTextLength < 180 && ATTACHMENT_HINT_RE.test(text.normalizedText)
  );
  const imageOnlySuspected = bodyTextLength < 80 && imageUrls.length > 0 && attachments.length === 0;
  const noAssets = imageUrls.length === 0 && attachments.length === 0;
  const reasonCodes = [];
  if (text.encodingOrMojibakeSuspected) reasonCodes.push("encoding_or_mojibake_suspected");
  if (attachmentOnlyPossible) reasonCodes.push("attachment_only_possible");
  if (imageOnlySuspected) reasonCodes.push("image_only_suspected");
  if (shortBodySuspected) reasonCodes.push("short_body");
  if (shortBodySuspected || imageOnlySuspected) reasonCodes.push("second_pass_parser_recommended");

  let classification = "clean";
  let disposition = "auto_pass_allowed";
  if (text.encodingOrMojibakeSuspected) {
    classification = "blocked";
    disposition = "blocked_until_encoding_review";
  } else if (attachmentOnlyPossible && attachments.length === 0) {
    classification = "blocked";
    disposition = "blocked_until_attachment_check";
  } else if (imageOnlySuspected || shortBodySuspected || (attachments.length > 0 && shortBodySuspected)) {
    classification = "needs_review";
    disposition = "admin_review_required";
  }
  return {
    ...text,
    bodyTextLength,
    noAssets,
    imageOnlySuspected,
    attachmentOnlyPossible,
    shortBodySuspected,
    secondPassParserRecommended: shortBodySuspected || imageOnlySuspected,
    attachmentMetadataPresent: attachments.length > 0,
    attachmentDownloadUnverified: attachments.length > 0,
    reasonCodes,
    classification,
    disposition,
  };
}

/**
 * 셀렉터 본문이 짧으면 휴리스틱으로 보강하고, 이미지 URL도 함께 반환.
 */
export function extractDetailFromCheerio($, options = {}) {
  replaceTablesWithMarkdown($);

  const baseUrl = cleanText(options.baseUrl);
  const detailContentSelector = cleanText(options.detailContentSelector);
  const sourceSelectors = getSourceSpecificDetailContentSelectors(options.sourceId);
  let content = "";
  let contentSelector = "";
  for (const selector of sourceSelectors) {
    const candidate = preserveLineBreaks($(selector).first().text());
    if (candidate.length >= 80) {
      content = candidate;
      contentSelector = selector;
      break;
    }
  }
  if (!content && detailContentSelector) {
    content = preserveLineBreaks($(detailContentSelector).first().text());
    if (content) contentSelector = detailContentSelector;
  }
  if (content.length < 80) {
    content = pickBestCandidateText($);
    if (content) contentSelector = contentSelector || "heuristic";
  }

  const imageRoot =
    detailContentSelector && $(detailContentSelector).length > 0
      ? detailContentSelector
      : "";
  const imageUrls = extractNoticeImageUrls($, baseUrl, {
    rootSelector: imageRoot,
    max: options.maxImages ?? 20,
  });

  const attachmentMetadata = extractNoticeAttachmentMetadata($, baseUrl, {
    max: options.maxAttachments ?? 20,
  });
  const qualitySignals = evaluateDetailQualitySignals({ content, imageUrls, attachmentMetadata });
  return { content: qualitySignals.normalizedText, imageUrls, attachmentMetadata, contentSelector, qualitySignals };
}

export function extractDetailFromHtml(html, options = {}) {
  const $ = loadHtml(String(html ?? ""));
  $("script, style, nav, footer, header, aside, noscript").remove();
  return extractDetailFromCheerio($, options);
}

export function imageUrlsToCsvCell(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return "";
  return urls.join("|");
}

export function attachmentMetadataToCsvCell(records) {
  if (!Array.isArray(records) || records.length === 0) return "";
  return JSON.stringify(records);
}

export function parseImageUrlsCsvCell(value) {
  const raw = cleanText(value);
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item) => typeof item === "string")
          .map((item) => cleanText(item))
          .filter(Boolean);
      }
    } catch {
      // fall through to pipe-split
    }
  }
  return raw
    .split("|")
    .map((item) => cleanText(item))
    .filter(Boolean);
}
