import { load as loadHtml } from "cheerio";
import {
  ORIGINAL_NOTICE_FORMAT_SYSTEM_PROMPT,
  stripFormattedNoticeOutput,
} from "@/lib/original-notice-format";

// ─────────────────────────────────────────────────────────────────
// 공지 본문 → scholarship 필드 초안 추출 (프로바이더 비종속)
// + 원문 공고문 형식만 정리 (formatOriginalNoticeText)
//
// 환경변수:
//   LLM_API_KEY    (필수) Bearer 토큰
//   LLM_API_BASE   (선택) 기본 https://api.openai.com/v1
//   LLM_MODEL      (선택) 기본 gpt-4o-mini
//   LLM_PROVIDER   (선택) openai | anthropic (미지정 시 자동 감지)
//
// OpenAI(OpenRouter/Together 포함)와 Anthropic Messages API를 지원.
// ─────────────────────────────────────────────────────────────────

const SUPPORT_CATEGORIES = [
  "등록금",
  "생활비",
  "학업장려금",
  "연구비",
  "해외연수비",
  "기타",
] as const;

const ENROLLMENT_STATUSES = [
  "신입생",
  "재학",
  "휴학",
  "초과이수기",
  "수료",
  "졸업예정",
  "졸업",
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const SELECTION_PHASES = ["selection", "post_acceptance"] as const;

/** 선발 단계 초안 항목 (scholarship_selection_stages 저장 전 단계) */
export type NoticeDraftStage = {
  title: string;
  phase: (typeof SELECTION_PHASES)[number];
  schedule_text: string | null;
  note: string | null;
};

/** extracted_draft에 저장되는 안전한 형태(부분 scholarship). */
export type NoticeDraft = {
  support_amount_text?: string | null;
  support_types?: string[];
  apply_start_date?: string | null;
  apply_end_date?: string | null;
  announcement_date?: string | null;
  selection_count?: number | null;
  qual_gpa_min?: number | null;
  qual_academic_year?: number[] | null;
  qual_enrollment_status?: string[] | null;
  qual_major?: string[] | null;
  qual_income_level_min?: number | null;
  qual_income_level_max?: number | null;
  qual_special_info?: string[] | null;
  qual_extra_requirements?: string[] | null;
  required_documents?: string[];
  apply_method?: string | null;
  contact?: string | null;
  note?: string | null;
  /** 선발 단계 + 합격 이후 절차 (순서대로). 본문에 명시되지 않으면 빈 배열 */
  stages?: NoticeDraftStage[];
};

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
];

const SYSTEM_PROMPT = `당신은 한국 대학 장학 공지에서 정형 데이터를 추출하는 도우미입니다.
주어진 공지 제목과 본문만 근거로, 아래 JSON 스키마에 맞춰 값을 추출하세요.
규칙:
- 본문에 명확히 드러나지 않는 값은 절대 추측하지 말고 null(또는 빈 배열)로 두세요.
- 날짜는 반드시 "YYYY-MM-DD" 형식. 연도가 없으면 null.
- 지원금액은 support_amount_text에 원문 표현으로 저장합니다.
- support_types는 다음 중에서만: ${SUPPORT_CATEGORIES.join(", ")}.
- qual_enrollment_status는 다음 중에서만: ${ENROLLMENT_STATUSES.join(", ")}.
- qual_income_level_min/max는 소득분위 0~10 정수.
- stages는 공고에 나온 전형 절차를 순서대로 배열로 추출하세요. 각 항목은
  { "title": string, "phase": "selection" | "post_acceptance", "schedule_text": string|null, "note": string|null }.
  - phase: 지원자가 통과해야 하는 관문(서류심사, 면접, 최종발표 등)은 "selection",
    합격 후 이어지는 절차(오리엔테이션, 파견, 연수, 수혜 시작 등)는 "post_acceptance".
  - schedule_text: 공고 원문에 쓰인 표현을 그대로 자연스러운 텍스트로 적으세요
    (예: "2026년 8월 28일까지", "2026. 8. 3. ~ 8. 28.", "2026년 10월 중", "추후 공지").
    굳이 "YYYY-MM-DD" 숫자 형식으로 바꿔 쓸 필요 없습니다. 날짜/시기를 전혀 알 수 없으면 null.
  - note: "참석 필수"처럼 짧은 보조 설명이 있으면 적고, 없으면 null.
  - 전형 절차가 본문에 없으면 빈 배열로 두세요.
- 반드시 JSON 객체 하나만 출력. 설명 텍스트 금지.`;

function buildUserPrompt(input: {
  title: string;
  body: string;
  sourceName: string;
}): string {
  return [
    `[기관] ${input.sourceName}`,
    `[제목] ${input.title}`,
    `[본문]`,
    input.body.slice(0, 12000),
    "",
    `다음 키를 가진 JSON으로 출력: support_amount_text, support_types, apply_start_date, apply_end_date, announcement_date, selection_count, qual_gpa_min, qual_academic_year, qual_enrollment_status, qual_major, qual_income_level_min, qual_income_level_max, qual_special_info, qual_extra_requirements, required_documents, apply_method, contact, note, stages`,
  ].join("\n");
}

function toDateOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, 10);
  return ISO_DATE.test(t) ? t : null;
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[,\s원]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStringArray(v: unknown, allowed?: readonly string[]): string[] {
  if (!Array.isArray(v)) return [];
  const items = v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
  if (allowed) return items.filter((x) => allowed.includes(x));
  return items;
}

function toIntArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => toNumberOrNull(x))
    .filter((n): n is number => n !== null)
    .map((n) => Math.trunc(n));
}

function toStringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function clampLevel(v: unknown): number | null {
  const n = toNumberOrNull(v);
  if (n === null) return null;
  const i = Math.trunc(n);
  if (i < 0 || i > 10) return null;
  return i;
}

function isSelectionPhase(v: unknown): v is (typeof SELECTION_PHASES)[number] {
  return typeof v === "string" && (SELECTION_PHASES as readonly string[]).includes(v);
}

/** LLM이 반환한 stages 배열을 신뢰 가능한 형태로 정규화 (형식이 어긋난 항목은 제외) */
function toStageArray(v: unknown): NoticeDraftStage[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item): NoticeDraftStage[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = toStringOrNull(record.title);
    if (!title) return [];
    const phase = isSelectionPhase(record.phase) ? record.phase : "selection";
    return [
      {
        title,
        phase,
        schedule_text: toStringOrNull(record.schedule_text),
        note: toStringOrNull(record.note),
      },
    ];
  });
}

/** LLM 원시 JSON → 타입 안전한 NoticeDraft로 정규화 (신뢰 불가 입력 방어). */
export function normalizeDraft(raw: unknown): NoticeDraft {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    support_amount_text: toStringOrNull(o.support_amount_text),
    support_types: toStringArray(o.support_types, SUPPORT_CATEGORIES),
    apply_start_date: toDateOrNull(o.apply_start_date),
    apply_end_date: toDateOrNull(o.apply_end_date),
    announcement_date: toDateOrNull(o.announcement_date),
    selection_count: toNumberOrNull(o.selection_count),
    qual_gpa_min: toNumberOrNull(o.qual_gpa_min),
    qual_academic_year: toIntArray(o.qual_academic_year),
    qual_enrollment_status: toStringArray(
      o.qual_enrollment_status,
      ENROLLMENT_STATUSES
    ),
    qual_major: toStringArray(o.qual_major),
    qual_income_level_min: clampLevel(o.qual_income_level_min),
    qual_income_level_max: clampLevel(o.qual_income_level_max),
    qual_special_info: toStringArray(o.qual_special_info),
    qual_extra_requirements: toStringArray(o.qual_extra_requirements),
    required_documents: toStringArray(o.required_documents),
    apply_method: toStringOrNull(o.apply_method),
    contact: toStringOrNull(o.contact),
    note: toStringOrNull(o.note),
    stages: toStageArray(o.stages),
  };
}

function parseJsonObjectFromText(text: string): { parsed?: unknown; error?: string } {
  try {
    return { parsed: JSON.parse(text) };
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { error: "LLM이 JSON을 반환하지 않았습니다." };
    try {
      return { parsed: JSON.parse(match[0]) };
    } catch {
      return { error: "LLM JSON 파싱 실패." };
    }
  }
}

function cleanText(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCharset(value: string): string {
  const normalized = cleanText(value).toLowerCase().replace(/^['"]|['"]$/g, "");
  if (!normalized) return "";
  if (normalized === "utf8") return "utf-8";
  if (["cp949", "ms949", "ks_c_5601-1987"].includes(normalized)) return "euc-kr";
  return normalized;
}

function detectCharsetFromHeaders(contentType: string): string {
  const raw = cleanText(contentType);
  if (!raw) return "";
  const match = raw.match(/charset\s*=\s*([^;]+)/i);
  if (!match) return "";
  return normalizeCharset(match[1]);
}

function detectCharsetFromHtmlProbe(htmlProbe: string): string {
  const probe = cleanText(htmlProbe);
  if (!probe) return "";
  const metaCharset = probe.match(
    /<meta[^>]*charset\s*=\s*["']?\s*([a-zA-Z0-9._-]+)/i
  );
  if (metaCharset?.[1]) return normalizeCharset(metaCharset[1]);
  const metaContent = probe.match(
    /<meta[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([a-zA-Z0-9._-]+)/i
  );
  if (metaContent?.[1]) return normalizeCharset(metaContent[1]);
  return "";
}

function decodeHtmlBuffer(buffer: Uint8Array, headerCharset: string): string {
  const probe = new TextDecoder("latin1").decode(buffer.subarray(0, 4096));
  const metaCharset = detectCharsetFromHtmlProbe(probe);
  const candidates = [headerCharset, metaCharset, "utf-8", "euc-kr"]
    .map((value) => normalizeCharset(value))
    .filter(Boolean);
  const uniqueCandidates = [...new Set(candidates)];

  for (const charset of uniqueCandidates) {
    try {
      return new TextDecoder(charset, { fatal: true }).decode(buffer);
    } catch {
      // Try next charset candidate.
    }
  }
  return new TextDecoder("utf-8").decode(buffer);
}

function scoreTextContent(text: string, linkText: string, preferredBoost = 0): number {
  const textLen = text.length;
  if (textLen < 80) return -1;
  const linkLen = linkText.length;
  const linkDensity = Math.min(1, linkLen / Math.max(1, textLen));
  const keywordHits = BODY_KEYWORDS.reduce(
    (count, keyword) => count + (text.includes(keyword) ? 1 : 0),
    0
  );
  const menuHits = MENU_HINTS.reduce(
    (count, keyword) => count + (text.includes(keyword) ? 1 : 0),
    0
  );
  const sentenceLike = (text.match(/[.!?\n]|다\.|요\.|니다\./g) ?? []).length;
  return (
    textLen * (1 - linkDensity) +
    keywordHits * 220 +
    sentenceLike * 8 +
    preferredBoost -
    menuHits * 90
  );
}

function collectCandidateTexts(
  $: ReturnType<typeof loadHtml>,
  selector: string,
  preferredBoost = 0
): { text: string; score: number }[] {
  const out: { text: string; score: number }[] = [];
  $(selector).each((index, node) => {
    if (index > 60) return false;
    const root = $(node);
    const text = cleanText(root.text());
    if (text.length < 80) return undefined;
    const linkText = cleanText(root.find("a").text());
    const score = scoreTextContent(text, linkText, preferredBoost);
    if (score > 0) out.push({ text, score });
    return undefined;
  });
  return out;
}

function pickBestCandidateText($: ReturnType<typeof loadHtml>): string {
  const selectors = [
    "article",
    "main",
    "#content",
    "#contents",
    "#bbs_content",
    ".content",
    ".contents",
    ".conts",
    ".board-view",
    ".board-view-content",
    ".board-content",
    ".board_view",
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
  ];

  const candidates: { text: string; score: number }[] = [];
  for (const selector of selectors) {
    candidates.push(...collectCandidateTexts($, selector, 240));
  }
  candidates.push(...collectCandidateTexts($, "section, div, td", 0));

  const ogDescription = cleanText(
    $('meta[property="og:description"]').attr("content") ?? ""
  );
  if (ogDescription.length >= 60) {
    candidates.push({
      text: ogDescription,
      score: scoreTextContent(ogDescription, "", 180),
    });
  }

  const bodyText = cleanText($("body").text());
  if (bodyText.length >= 120) {
    candidates.push({
      text: bodyText,
      score: scoreTextContent(bodyText, cleanText($("body a").text()), -120),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return (candidates[0]?.text ?? "").slice(0, 12000);
}

async function fetchNoticeBodyFromUrl(url: string): Promise<string> {
  if (!url) return "";
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return "";

    const headerCharset = detectCharsetFromHeaders(
      response.headers.get("content-type") ?? ""
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const html = decodeHtmlBuffer(bytes, headerCharset);
    const $ = loadHtml(html);
    $("script, style, nav, footer, header, aside, noscript").remove();
    return pickBestCandidateText($);
  } catch {
    return "";
  }
}

/**
 * 일부 최신 모델(Claude Opus 4.7+, OpenAI 추론 모델 등)은 temperature/top_p/top_k
 * 파라미터를 폐기(deprecated)하여 기본값이 아닌 값을 보내면 400 에러를 반환한다.
 * temperature 관련 400 에러가 감지되면 해당 파라미터 없이 한 번 더 시도한다.
 */
async function fetchLlmWithTemperatureFallback(
  url: string,
  headers: Record<string, string>,
  buildBody: (includeTemperature: boolean) => unknown
): Promise<{ response?: Response; error?: string }> {
  const attempt = async (
    includeTemperature: boolean
  ): Promise<{ response?: Response; error?: string }> => {
    try {
      return {
        response: await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(buildBody(includeTemperature)),
          signal: AbortSignal.timeout(60_000),
        }),
      };
    } catch (e) {
      return { error: `LLM 요청 실패: ${e instanceof Error ? e.message : e}` };
    }
  };

  const first = await attempt(true);
  if (first.error || !first.response) return first;
  if (first.response.ok) return first;

  const text = await first.response.text().catch(() => "");
  const isTemperatureDeprecation =
    first.response.status === 400 &&
    /temperature|top_p|top_k/i.test(text) &&
    /deprecat|not support|unsupported/i.test(text);
  if (!isTemperatureDeprecation) {
    return { error: `LLM 오류 ${first.response.status}: ${text.slice(0, 300)}` };
  }

  const retry = await attempt(false);
  if (retry.error || !retry.response) return retry;
  if (!retry.response.ok) {
    const retryText = await retry.response.text().catch(() => "");
    return {
      error: `LLM 오류 ${retry.response.status}: ${retryText.slice(0, 300)}`,
    };
  }
  return retry;
}

function resolveLlmConfig(): {
  apiKey: string;
  base: string;
  model: string;
  provider: "openai" | "anthropic";
} | { error: string } {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return { error: "LLM_API_KEY 환경변수가 설정되지 않았습니다." };
  }
  const providerFromEnv = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
  const base = (
    process.env.LLM_API_BASE ??
    (providerFromEnv === "anthropic" || apiKey.startsWith("sk-ant-")
      ? "https://api.anthropic.com/v1"
      : "https://api.openai.com/v1")
  ).replace(/\/$/, "");
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  const provider =
    providerFromEnv === "anthropic" ||
    base.includes("anthropic.com") ||
    apiKey.startsWith("sk-ant-")
      ? "anthropic"
      : "openai";
  return { apiKey, base, model, provider };
}

async function callOpenAiCompatible(params: {
  apiKey: string;
  base: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  /** JSON 객체 응답을 강제할지 (필드 추출용). 원문 포맷은 plain text. */
  jsonObject?: boolean;
}): Promise<{ content?: string; error?: string }> {
  const { response, error: fetchError } = await fetchLlmWithTemperatureFallback(
    `${params.base}/chat/completions`,
    {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    (includeTemperature) => ({
      model: params.model,
      ...(includeTemperature ? { temperature: 0 } : {}),
      ...(params.jsonObject ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
    })
  );
  if (fetchError || !response) return { error: fetchError };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { error: "LLM 응답을 JSON으로 파싱하지 못했습니다." };
  }

  const content = (
    payload as { choices?: { message?: { content?: string } }[] }
  )?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return { error: "LLM 응답에 content가 없습니다." };
  }
  return { content };
}

async function callAnthropic(params: {
  apiKey: string;
  base: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<{ content?: string; error?: string }> {
  const { response, error: fetchError } = await fetchLlmWithTemperatureFallback(
    `${params.base}/messages`,
    {
      "content-type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
    },
    (includeTemperature) => ({
      model: params.model,
      max_tokens: params.maxTokens ?? 1500,
      ...(includeTemperature ? { temperature: 0 } : {}),
      system: params.systemPrompt,
      messages: [{ role: "user", content: params.userPrompt }],
    })
  );
  if (fetchError || !response) return { error: fetchError };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { error: "LLM 응답을 JSON으로 파싱하지 못했습니다." };
  }

  const textBlock = (
    payload as { content?: { type?: string; text?: string }[] }
  )?.content?.find((block) => block?.type === "text")?.text;
  if (typeof textBlock !== "string") {
    return { error: "Anthropic 응답에 text content가 없습니다." };
  }
  return { content: textBlock };
}

async function callLlm(params: {
  systemPrompt: string;
  userPrompt: string;
  jsonObject?: boolean;
  maxTokens?: number;
}): Promise<{ content?: string; error?: string }> {
  const config = resolveLlmConfig();
  if ("error" in config) return { error: config.error };

  if (config.provider === "anthropic") {
    return callAnthropic({
      apiKey: config.apiKey,
      base: config.base,
      model: config.model,
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      maxTokens: params.maxTokens,
    });
  }
  return callOpenAiCompatible({
    apiKey: config.apiKey,
    base: config.base,
    model: config.model,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    jsonObject: params.jsonObject,
  });
}

export async function extractScholarshipDraft(input: {
  title: string;
  body: string;
  sourceName: string;
  noticeUrl?: string;
}): Promise<{ draft?: NoticeDraft; error?: string; resolvedBody?: string }> {
  let normalizedBody = input.body?.trim() ?? "";
  if (normalizedBody.length < 120 && input.noticeUrl) {
    const fetchedBody = await fetchNoticeBodyFromUrl(input.noticeUrl);
    if (fetchedBody.length > normalizedBody.length) {
      normalizedBody = fetchedBody;
    }
  }
  const promptBody =
    normalizedBody.length >= 10
      ? normalizedBody
      : `[본문 미수집]\n공지 제목만으로 추출 가능한 항목만 채우세요.\n${input.title}`;

  const userPrompt = buildUserPrompt({
    title: input.title,
    sourceName: input.sourceName,
    body: promptBody,
  });

  const { content, error: callError } = await callLlm({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    jsonObject: true,
    maxTokens: 1500,
  });
  if (callError) return { error: callError };
  if (!content) return { error: "LLM 응답 본문이 비어 있습니다." };

  const { parsed, error: parseError } = parseJsonObjectFromText(content);
  if (parseError || parsed === undefined) return { error: parseError };

  return { draft: normalizeDraft(parsed), resolvedBody: normalizedBody };
}

/**
 * 원문 공고문: 문장·숫자는 유지하고 줄바꿈·섹션·목록 마커만 규칙에 맞게 정리.
 * 실패 시 원문을 그대로 반환하고 error를 함께 준다 (호출측이 막히지 않게).
 */
export async function formatOriginalNoticeText(input: {
  title?: string;
  body: string;
}): Promise<{ text: string; error?: string }> {
  const original = input.body?.trim() ?? "";
  if (!original) {
    return { text: "", error: "정리할 원문 본문이 비어 있습니다." };
  }
  // 이미 매우 짧으면 LLM 비용 없이 그대로
  if (original.length < 40) {
    return { text: original };
  }

  const userPrompt = [
    input.title?.trim() ? `[공고 제목] ${input.title.trim()}` : null,
    `[원문]`,
    original.slice(0, 14000),
    "",
    "위 원문의 형식만 규칙에 맞게 정리해 출력하세요. 문구·숫자는 변경 금지.",
  ]
    .filter(Boolean)
    .join("\n");

  const { content, error: callError } = await callLlm({
    systemPrompt: ORIGINAL_NOTICE_FORMAT_SYSTEM_PROMPT,
    userPrompt,
    jsonObject: false,
    maxTokens: 4000,
  });
  if (callError) return { text: original, error: callError };
  if (!content?.trim()) {
    return { text: original, error: "LLM 응답 본문이 비어 있습니다." };
  }

  const formatted = stripFormattedNoticeOutput(content);
  if (!formatted || formatted.length < Math.min(20, original.length * 0.3)) {
    return {
      text: original,
      error: "LLM 포맷 결과가 비정상적으로 짧아 원문을 유지합니다.",
    };
  }
  return { text: formatted };
}
