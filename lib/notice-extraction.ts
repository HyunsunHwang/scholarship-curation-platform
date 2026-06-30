// ─────────────────────────────────────────────────────────────────
// 공지 본문 → scholarship 필드 초안 추출 (프로바이더 비종속, OpenAI 호환)
//
// 환경변수:
//   LLM_API_KEY    (필수) Bearer 토큰
//   LLM_API_BASE   (선택) 기본 https://api.openai.com/v1
//   LLM_MODEL      (선택) 기본 gpt-4o-mini
//
// OpenAI / OpenRouter / Together 등 /chat/completions 호환 엔드포인트면 동작.
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
};

const SYSTEM_PROMPT = `당신은 한국 대학 장학 공지에서 정형 데이터를 추출하는 도우미입니다.
주어진 공지 제목과 본문만 근거로, 아래 JSON 스키마에 맞춰 값을 추출하세요.
규칙:
- 본문에 명확히 드러나지 않는 값은 절대 추측하지 말고 null(또는 빈 배열)로 두세요.
- 날짜는 반드시 "YYYY-MM-DD" 형식. 연도가 없으면 null.
- 지원금액은 support_amount_text에 원문 표현으로 저장합니다.
- support_types는 다음 중에서만: ${SUPPORT_CATEGORIES.join(", ")}.
- qual_enrollment_status는 다음 중에서만: ${ENROLLMENT_STATUSES.join(", ")}.
- qual_income_level_min/max는 소득분위 0~10 정수.
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
    `다음 키를 가진 JSON으로 출력: support_amount_text, support_types, apply_start_date, apply_end_date, announcement_date, selection_count, qual_gpa_min, qual_academic_year, qual_enrollment_status, qual_major, qual_income_level_min, qual_income_level_max, qual_special_info, qual_extra_requirements, required_documents, apply_method, contact, note`,
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
  };
}

export async function extractScholarshipDraft(input: {
  title: string;
  body: string;
  sourceName: string;
}): Promise<{ draft?: NoticeDraft; error?: string }> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return { error: "LLM_API_KEY 환경변수가 설정되지 않았습니다." };
  }
  if (!input.body || input.body.trim().length < 10) {
    return { error: "추출할 본문이 없습니다. (크롤러 본문이 비어 있음)" };
  }

  const base = (process.env.LLM_API_BASE ?? "https://api.openai.com/v1").replace(
    /\/$/,
    ""
  );
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";

  let response: Response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input) },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    return { error: `LLM 요청 실패: ${e instanceof Error ? e.message : e}` };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { error: `LLM 오류 ${response.status}: ${text.slice(0, 300)}` };
  }

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

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // 코드펜스 등으로 감싸진 경우 첫 JSON 블록만 추출 시도
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return { error: "LLM이 JSON을 반환하지 않았습니다." };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return { error: "LLM JSON 파싱 실패." };
    }
  }

  return { draft: normalizeDraft(parsed) };
}
