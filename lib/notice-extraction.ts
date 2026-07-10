import {
  ORIGINAL_NOTICE_FORMAT_SYSTEM_PROMPT,
  stripFormattedNoticeOutput,
} from "@/lib/original-notice-format";
import { extractDetailFromHtml } from "@/lib/notice-body-extraction.mjs";

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

const SCHOOL_LOCATIONS = ["국내 대학", "해외 대학"] as const;
const SCHOOL_CATEGORIES = [
  "4년제",
  "전문대",
  "대학원",
  "사이버대",
  "방통대",
] as const;

const FIELD_CODES = [
  "인문",
  "사회",
  "교육",
  "공학",
  "자연",
  "의약",
  "예체능",
] as const;

const GENDERS = ["남성", "여성"] as const;
const NATIONALITIES = ["내국인", "외국인"] as const;
const ADMISSION_TYPES = ["일반입학", "편입학", "재입학"] as const;
const PARENT_COHABITATIONS = ["동거", "별거"] as const;
const MILITARY_STATUSES = ["군필", "미필", "비대상", "면제"] as const;
const PARENT_OCCUPATIONS = [
  "직업군인",
  "군무원",
  "농축어업인",
  "건설근로자",
  "소상공인",
  "경찰/소방관",
  "택배기사",
  "환경미화원",
  "연극인",
  "외국인 근로자",
] as const;

const SPECIAL_INFO_VALUES = [
  "다문화가정",
  "기초생활수급자",
  "차상위계층",
  "장애인(본인)",
  "장애인(가정)",
  "농어촌자녀",
  "보훈대상자",
  "조부모가정",
  "다자녀",
  "한부모가정",
  "학생가장",
  "북한이탈주민",
  "자립준비청년",
  "독립유공자후손",
  "공상자",
  "산재근로자 가정",
  "순직자유자녀",
] as const;

/** source_group → 교내 대상 대학교명 */
const SOURCE_GROUP_UNIVERSITY: Record<string, string> = {
  skku: "성균관대학교",
  yonsei: "연세대학교",
  korea: "고려대학교",
  ewha: "이화여자대학교",
  cau: "중앙대학교",
  hanyang: "한양대학교",
  hongik: "홍익대학교",
  khu: "경희대학교",
  uos: "서울시립대학교",
};

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
  qual_university?: string[] | null;
  qual_school_location?: string[] | null;
  qual_school_category?: string[] | null;
  qual_academic_year?: number[] | null;
  qual_enrollment_status?: string[] | null;
  qual_major?: string[] | null;
  qual_field_codes?: string[] | null;
  qual_gpa_min?: number | null;
  qual_gpa_last_semester_min?: number | null;
  qual_last_semester_earned_credits_min?: number | null;
  qual_income_level_min?: number | null;
  qual_income_level_max?: number | null;
  qual_household_size_max?: number | null;
  qual_gender?: string | null;
  qual_age_min?: number | null;
  qual_age_max?: number | null;
  qual_region?: string[] | null;
  qual_nationality?: string | null;
  qual_admission_type?: string[] | null;
  qual_parent_cohabitation?: string | null;
  qual_parent_region?: string[] | null;
  qual_special_info?: string[] | null;
  qual_extra_requirements?: string[] | null;
  qual_parent_occupation?: string[] | null;
  qual_military_status?: string | null;
  required_documents?: string[];
  apply_method?: string | null;
  contact?: string | null;
  note?: string | null;
  /** 선발 단계 + 합격 이후 절차 (순서대로). 본문에 명시되지 않으면 빈 배열 */
  stages?: NoticeDraftStage[];
};

const SYSTEM_PROMPT = `당신은 한국 대학 장학 공지에서 정형 데이터를 추출하는 도우미입니다.
주어진 공지 제목과 본문만 근거로, 아래 JSON 스키마에 맞춰 값을 추출하세요.
규칙:
- 본문에 명확히 드러나지 않는 값은 절대 추측하지 말고 null(또는 빈 배열)로 두세요.
- 날짜는 반드시 "YYYY-MM-DD" 형식. 연도가 없으면 null.
- 지원금액은 support_amount_text에 원문 표현으로 저장합니다.
- support_types는 다음 중에서만: ${SUPPORT_CATEGORIES.join(", ")}.
- qual_enrollment_status는 다음 중에서만: ${ENROLLMENT_STATUSES.join(", ")}.
- qual_school_location은 다음 중에서만: ${SCHOOL_LOCATIONS.join(", ")}.
  "국내 4년제 대학교", "국내 대학 재학생"처럼 국내 대학임이 드러나면 ["국내 대학"].
- qual_school_category는 다음 중에서만: ${SCHOOL_CATEGORIES.join(", ")}.
  "4년제 대학교", "학부 재학생"처럼 4년제 학부임이 드러나면 ["4년제"].
  전문대/대학원/사이버대/방통대가 명시되면 해당 값을 넣으세요.
- qual_academic_year는 1~5 정수 배열. "전학년"이면 [1,2,3,4], "1~3학년"이면 [1,2,3].
- qual_field_codes는 다음 중에서만: ${FIELD_CODES.join(", ")}. 이공계면 ["공학","자연"]처럼.
- qual_gender는 다음 중 하나: ${GENDERS.join(", ")}.
- qual_nationality는 다음 중 하나: ${NATIONALITIES.join(", ")}.
- qual_admission_type는 다음 중에서만: ${ADMISSION_TYPES.join(", ")}.
- qual_parent_cohabitation는 다음 중 하나: ${PARENT_COHABITATIONS.join(", ")}.
- qual_parent_occupation는 다음 중에서만: ${PARENT_OCCUPATIONS.join(", ")}.
- qual_military_status는 다음 중 하나: ${MILITARY_STATUSES.join(", ")}.
- qual_special_info는 가능하면 다음 표준값만: ${SPECIAL_INFO_VALUES.join(", ")}.
  표준값에 안 맞으면 원문 표현을 그대로 두고, 호출측이 기타 요건으로 옮깁니다.
- qual_income_level_min/max는 소득분위 0~10 정수.
- qual_gpa_min / qual_gpa_last_semester_min은 반드시 4.5 만점 기준 숫자로 출력하세요.
  원문이 4.3·4.0·100점 만점이면 4.5로 환산하세요.
  예: 3.0/4.3 → 3.14, 3.0/4.0 → 3.38, 80/100 → 3.6, 3.0(4.5만점) → 3.0.
  만점이 명시되지 않고 값이 0~4.5면 그대로, 4.5 초과~100이하면 100점 만점으로 환산.
- qual_university는 본문에 특정 대학만 대상이라고 명시된 경우에만 대학명 배열.
- stages는 공고에 나온 전형 절차를 순서대로 배열로 추출하세요. 각 항목은
  { "title": string, "phase": "selection" | "post_acceptance", "schedule_text": string|null, "note": string|null }.
  - phase: 지원자가 통과해야 하는 관문(서류심사, 면접, 최종발표 등)은 "selection",
    합격 후 이어지는 절차(오리엔테이션, 파견, 연수, 수혜 시작 등)는 "post_acceptance".
  - schedule_text: 공고 원문에 쓰인 표현을 그대로 자연스러운 텍스트로 적으세요
    (예: "2026년 8월 28일까지", "2026. 8. 3. ~ 8. 28.", "2026년 10월 중", "추후 공지").
    굳이 "YYYY-MM-DD" 숫자 형식으로 바꿔 쓸 필요 없습니다. 날짜/시기를 전혀 알 수 없으면 null.
  - note: "참석 필수"처럼 짧은 보조 설명이 있으면 적고, 없으면 null.
  - 전형 절차가 본문에 없으면 빈 배열로 두세요.
- 반드시 JSON 객체 하나만 출력. 설명 텍스트·마크다운 코드펜스 금지.
- 배열 필드는 반드시 JSON 배열로, 숫자는 숫자 타입으로 출력하세요.`;

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
    `다음 키를 가진 JSON으로 출력: support_amount_text, support_types, apply_start_date, apply_end_date, announcement_date, selection_count, qual_university, qual_school_location, qual_school_category, qual_academic_year, qual_enrollment_status, qual_major, qual_field_codes, qual_gpa_min, qual_gpa_last_semester_min, qual_last_semester_earned_credits_min, qual_income_level_min, qual_income_level_max, qual_household_size_max, qual_gender, qual_age_min, qual_age_max, qual_region, qual_nationality, qual_admission_type, qual_parent_cohabitation, qual_parent_region, qual_special_info, qual_extra_requirements, qual_parent_occupation, qual_military_status, required_documents, apply_method, contact, note, stages`,
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
    const match = v.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const GPA_SCALE_45 = 4.5;

/** 학점 값을 4.5 만점 기준으로 정규화 (4.3·4.0·100점 환산 포함). */
export function toGpaOn45Scale(v: unknown): number | null {
  let value: number | null = null;
  let scale: number | null = null;

  if (typeof v === "number" && Number.isFinite(v)) {
    value = v;
  } else if (typeof v === "string") {
    const text = v.replace(/,/g, "").trim();
    if (!text) return null;

    const slash = text.match(
      /(-?\d+(?:\.\d+)?)\s*\/\s*(4\.5|4\.3|4\.0|4|100)(?:\s*점)?/i
    );
    if (slash) {
      value = Number(slash[1]);
      scale = Number(slash[2] === "4" ? "4.0" : slash[2]);
    } else {
      const withScale = text.match(
        /(-?\d+(?:\.\d+)?)\s*(?:\(|\s)*(?:만점\s*)?(4\.5|4\.3|4\.0|4|100)\s*(?:만점|점)?/i
      );
      if (withScale) {
        value = Number(withScale[1]);
        scale = Number(withScale[2] === "4" ? "4.0" : withScale[2]);
      } else {
        value = toNumberOrNull(text);
        if (/100\s*점\s*만점|만점\s*100|百分|퍼센트/.test(text)) scale = 100;
        else if (/4\.3\s*만점|만점\s*4\.3/.test(text)) scale = 4.3;
        else if (/4\.0\s*만점|만점\s*4\.0|4점\s*만점/.test(text)) scale = 4.0;
        else if (/4\.5\s*만점|만점\s*4\.5/.test(text)) scale = GPA_SCALE_45;
      }
    }
  } else {
    return null;
  }

  if (value === null || !Number.isFinite(value) || value < 0) return null;

  if (scale == null) {
    // 만점 미명시: 0~4.5는 4.5 만점으로 보고, 10~100은 100점 만점으로 환산.
    // 4.5 초과~10 미만(예: 5.0)은 애매하므로 버림.
    if (value <= GPA_SCALE_45) scale = GPA_SCALE_45;
    else if (value >= 10 && value <= 100) scale = 100;
    else return null;
  }

  if (scale <= 0) return null;
  const converted =
    scale === GPA_SCALE_45 ? value : (value * GPA_SCALE_45) / scale;
  if (!Number.isFinite(converted)) return null;

  const rounded = Math.round(converted * 100) / 100;
  if (rounded < 0 || rounded > GPA_SCALE_45) return null;
  return rounded;
}

function splitLooseList(value: string): string[] {
  return value
    .split(/[,;/|·•\n]+|(?:\s+및\s+)|\s{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toStringArray(v: unknown, allowed?: readonly string[]): string[] {
  let items: string[] = [];
  if (Array.isArray(v)) {
    items = v
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean);
  } else if (typeof v === "string") {
    items = splitLooseList(v);
  }
  if (allowed) {
    return items
      .map((item) => toEnumOrNull(item, allowed))
      .filter((item): item is string => Boolean(item));
  }
  return items;
}

function normalizeAllowedString(
  value: string,
  allowed: readonly string[]
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (allowed.includes(trimmed)) return trimmed;
  // "재학생" → "재학" 같은 흔한 접미사 변형
  for (const option of allowed) {
    if (trimmed === `${option}생` || trimmed.startsWith(option)) return option;
  }
  return null;
}

/** 학교 소재/유형: LLM·원문 표현을 폼 옵션으로 정규화 */
function toSchoolLocationArray(v: unknown): string[] {
  const rawItems = Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : typeof v === "string"
      ? splitLooseList(v)
      : [];
  const out = new Set<string>();
  for (const item of rawItems) {
    const t = item.trim();
    if (!t) continue;
    const mapped = normalizeAllowedString(t, SCHOOL_LOCATIONS);
    if (mapped) {
      out.add(mapped);
      continue;
    }
    if (/해외|외국\s*대학|국외/.test(t)) out.add("해외 대학");
    else if (/국내/.test(t) && /대학|학교|학부|4년제|전문대/.test(t)) {
      out.add("국내 대학");
    }
  }
  return [...out];
}

function toSchoolCategoryArray(v: unknown): string[] {
  const rawItems = Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : typeof v === "string"
      ? splitLooseList(v)
      : [];
  const out = new Set<string>();
  for (const item of rawItems) {
    const t = item.trim();
    if (!t) continue;
    const mapped = normalizeAllowedString(t, SCHOOL_CATEGORIES);
    if (mapped) {
      out.add(mapped);
      continue;
    }
    if (/전문대|전문대학|2년제|3년제/.test(t)) out.add("전문대");
    else if (/대학원|석사|박사|대학원생/.test(t)) out.add("대학원");
    else if (/사이버대|원격대학|온라인대학/.test(t)) out.add("사이버대");
    else if (/방통대|방송통신대학|한국방송통신/.test(t)) out.add("방통대");
    else if (/4년제|학부|대학교/.test(t)) out.add("4년제");
  }
  return [...out];
}

function toIntArray(v: unknown): number[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => toNumberOrNull(x))
      .filter((n): n is number => n !== null)
      .map((n) => Math.trunc(n));
  }
  if (typeof v === "string") {
    return splitLooseList(v)
      .map((x) => toNumberOrNull(x))
      .filter((n): n is number => n !== null)
      .map((n) => Math.trunc(n));
  }
  const single = toNumberOrNull(v);
  return single === null ? [] : [Math.trunc(single)];
}

function toStringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function toEnumOrNull(
  v: unknown,
  allowed: readonly string[]
): string | null {
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    const direct = normalizeAllowedString(trimmed, allowed);
    if (direct) return direct;
    if (allowed === GENDERS || allowed[0] === "남성") {
      if (/여학생|여성|여자/.test(trimmed) && !/남성|남학생|남자/.test(trimmed)) {
        return "여성";
      }
      if (/남학생|남성|남자/.test(trimmed) && !/여성|여학생|여자/.test(trimmed)) {
        return "남성";
      }
    }
    if (allowed === NATIONALITIES || allowed[0] === "내국인") {
      if (/외국인|외국\s*국적|외국\s*유학생/.test(trimmed)) return "외국인";
      if (/내국인|한국\s*국적|대한민국\s*국적/.test(trimmed)) return "내국인";
    }
    if (allowed === ADMISSION_TYPES || allowed.includes("편입학")) {
      if (/편입/.test(trimmed)) return "편입학";
      if (/재입/.test(trimmed)) return "재입학";
      if (/일반\s*입학|신입/.test(trimmed)) return "일반입학";
    }
    return null;
  }
  if (Array.isArray(v) && v.length > 0) {
    return toEnumOrNull(v[0], allowed);
  }
  return null;
}

function toAcademicYearArray(v: unknown): number[] {
  if (typeof v === "string") {
    const t = v.trim();
    if (/전학년|전체\s*학년|모든\s*학년/.test(t)) return [1, 2, 3, 4];
    const range = t.match(/([1-5])\s*[~\-–]\s*([1-5])\s*학년?/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    }
  }
  return toIntArray(v)
    .map((n) => Math.trunc(n))
    .filter((n) => n >= 1 && n <= 5);
}

function toFieldCodeArray(v: unknown): string[] {
  const rawItems = Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : typeof v === "string"
      ? splitLooseList(v)
      : [];
  const out = new Set<string>();
  for (const item of rawItems) {
    const t = item.trim();
    if (!t) continue;
    const mapped = normalizeAllowedString(t, FIELD_CODES);
    if (mapped) {
      out.add(mapped);
      continue;
    }
    if (/이공|STEM|과학기술/.test(t)) {
      out.add("공학");
      out.add("자연");
    } else if (/인문/.test(t)) out.add("인문");
    else if (/사회|경영|경제/.test(t)) out.add("사회");
    else if (/교육/.test(t)) out.add("교육");
    else if (/공학|공과|컴퓨터|전자|기계/.test(t)) out.add("공학");
    else if (/자연|이학|수학|물리|화학|생물/.test(t)) out.add("자연");
    else if (/의약|의학|약학|간호/.test(t)) out.add("의약");
    else if (/예체능|예술|체육|음악|미술/.test(t)) out.add("예체능");
  }
  return [...out];
}

function toSpecialInfoArray(v: unknown): string[] {
  const rawItems = Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : typeof v === "string"
      ? splitLooseList(v)
      : [];
  const out: string[] = [];
  for (const item of rawItems) {
    const t = item.trim();
    if (!t) continue;
    if (t === "새터민") {
      out.push("북한이탈주민");
      continue;
    }
    if (t === "장애인") {
      out.push("장애인(본인)", "장애인(가정)");
      continue;
    }
    const mapped = normalizeAllowedString(t, SPECIAL_INFO_VALUES);
    out.push(mapped ?? t);
  }
  return [...new Set(out)];
}

function clampNonNegativeInt(v: unknown): number | null {
  const n = toNumberOrNull(v);
  if (n === null) return null;
  const i = Math.trunc(n);
  return i >= 0 ? i : null;
}

function isSelectionPhase(v: unknown): v is (typeof SELECTION_PHASES)[number] {
  return typeof v === "string" && (SELECTION_PHASES as readonly string[]).includes(v);
}

/** LLM이 반환한 stages 배열을 신뢰 가능한 형태로 정규화 (형식이 어긋난 항목은 제외) */
function toStageArray(v: unknown): NoticeDraftStage[] {
  if (typeof v === "string") {
    const title = v.trim();
    if (!title) return [];
    // "서류심사 → 면접 → 최종발표" 형태를 단계로 쪼갬
    const parts = title
      .split(/\s*(?:→|->|›|»|\/|,)\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length <= 1) {
      return [{ title, phase: "selection", schedule_text: null, note: null }];
    }
    return parts.map((part) => ({
      title: part,
      phase: "selection" as const,
      schedule_text: null,
      note: null,
    }));
  }
  if (!Array.isArray(v)) return [];
  return v.flatMap((item): NoticeDraftStage[] => {
    if (typeof item === "string") {
      const title = item.trim();
      if (!title) return [];
      return [{ title, phase: "selection", schedule_text: null, note: null }];
    }
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
    qual_university: toStringArray(o.qual_university),
    qual_school_location: toSchoolLocationArray(o.qual_school_location),
    qual_school_category: toSchoolCategoryArray(o.qual_school_category),
    qual_academic_year: toAcademicYearArray(o.qual_academic_year),
    qual_enrollment_status: toStringArray(
      o.qual_enrollment_status,
      ENROLLMENT_STATUSES
    ),
    qual_major: toStringArray(o.qual_major),
    qual_field_codes: toFieldCodeArray(o.qual_field_codes),
    qual_gpa_min: toGpaOn45Scale(o.qual_gpa_min),
    qual_gpa_last_semester_min: toGpaOn45Scale(o.qual_gpa_last_semester_min),
    qual_last_semester_earned_credits_min: toNumberOrNull(
      o.qual_last_semester_earned_credits_min
    ),
    qual_income_level_min: clampLevel(o.qual_income_level_min),
    qual_income_level_max: clampLevel(o.qual_income_level_max),
    qual_household_size_max: clampNonNegativeInt(o.qual_household_size_max),
    qual_gender: toEnumOrNull(o.qual_gender, GENDERS),
    qual_age_min: clampNonNegativeInt(o.qual_age_min),
    qual_age_max: clampNonNegativeInt(o.qual_age_max),
    qual_region: toStringArray(o.qual_region),
    qual_nationality: toEnumOrNull(o.qual_nationality, NATIONALITIES),
    qual_admission_type: toStringArray(o.qual_admission_type, ADMISSION_TYPES),
    qual_parent_cohabitation: toEnumOrNull(
      o.qual_parent_cohabitation,
      PARENT_COHABITATIONS
    ),
    qual_parent_region: toStringArray(o.qual_parent_region),
    qual_special_info: toSpecialInfoArray(o.qual_special_info),
    qual_extra_requirements: toStringArray(o.qual_extra_requirements),
    qual_parent_occupation: toStringArray(
      o.qual_parent_occupation,
      PARENT_OCCUPATIONS
    ),
    qual_military_status: toEnumOrNull(
      o.qual_military_status,
      MILITARY_STATUSES
    ),
    required_documents: toStringArray(o.required_documents),
    apply_method: toStringOrNull(o.apply_method),
    contact: toStringOrNull(o.contact),
    note: toStringOrNull(o.note),
    stages: toStageArray(o.stages),
  };
}

function clampLevel(v: unknown): number | null {
  const n = toNumberOrNull(v);
  if (n === null) return null;
  const i = Math.trunc(n);
  if (i < 0 || i > 10) return null;
  return i;
}

function parseJsonObjectFromText(text: string): { parsed?: unknown; error?: string } {
  const raw = String(text ?? "").trim();
  if (!raw) return { error: "LLM이 JSON을 반환하지 않았습니다." };

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = (fenced?.[1] ?? raw).trim();

  // 코드펜스만 열리고 닫히지 않은 경우
  if (!fenced && candidate.startsWith("```")) {
    candidate = candidate.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  }

  // 앞뒤 설명문이 붙은 경우 첫 { ~ 마지막 } 구간만 사용
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidate = candidate.slice(firstBrace, lastBrace + 1);
  }

  const tryParse = (value: string): unknown | undefined => {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  };

  const sanitize = (value: string) =>
    value
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");

  const direct = tryParse(candidate);
  if (direct !== undefined) return { parsed: direct };

  const sanitized = sanitize(candidate);
  const sanitizedParsed = tryParse(sanitized);
  if (sanitizedParsed !== undefined) return { parsed: sanitizedParsed };

  const match = sanitized.match(/\{[\s\S]*/);
  if (!match) return { error: "LLM이 JSON을 반환하지 않았습니다." };

  const parsed = tryParse(match[0]);
  if (parsed !== undefined) return { parsed };

  // 잘린 JSON: 열린 괄호를 닫아 복구 시도
  const repaired = repairTruncatedJson(match[0]);
  const repairedParsed = repaired ? tryParse(repaired) : undefined;
  if (repairedParsed !== undefined) return { parsed: repairedParsed };

  return { error: "LLM JSON 파싱 실패." };
}

function repairTruncatedJson(text: string): string | null {
  let s = text.trim();
  if (!s.startsWith("{")) return null;

  // 미완성 문자열 닫기
  const quoteCount = (s.match(/(?<!\\)"/g) ?? []).length;
  if (quoteCount % 2 === 1) s += '"';

  // trailing comma 제거
  s = s.replace(/,\s*$/, "");

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      if (stack.length === 0 || stack[stack.length - 1] !== ch) return null;
      stack.pop();
    }
  }
  if (inString) return null;
  while (stack.length > 0) s += stack.pop();
  return s;
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

async function fetchNoticeDetailFromUrl(
  url: string
): Promise<{ content: string; imageUrls: string[] }> {
  if (!url) return { content: "", imageUrls: [] };
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { content: "", imageUrls: [] };

    const headerCharset = detectCharsetFromHeaders(
      response.headers.get("content-type") ?? ""
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const html = decodeHtmlBuffer(bytes, headerCharset);
    const { content, imageUrls } = extractDetailFromHtml(html, {
      baseUrl: url,
    });
    return {
      content: content ?? "",
      imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
    };
  } catch {
    return { content: "", imageUrls: [] };
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
          // Vercel 함수 한도(최대 60s) 안에서 끝나도록 여유를 둔다.
          signal: AbortSignal.timeout(55_000),
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

function extractAnthropicTextContent(payload: unknown): string | null {
  const blocks = (payload as { content?: unknown })?.content;
  if (!Array.isArray(blocks)) return null;

  const texts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const record = block as { type?: string; text?: string };
    // thinking 블록은 무시하고 text만 모은다.
    if (record.type === "text" && typeof record.text === "string") {
      texts.push(record.text);
    }
  }
  if (texts.length === 0) return null;
  return texts.join("\n").trim();
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
      // thinking 모델은 output budget을 사고 과정에 많이 쓰므로 여유를 둔다.
      max_tokens: params.maxTokens ?? 4096,
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

  const textBlock = extractAnthropicTextContent(payload);
  if (typeof textBlock !== "string" || !textBlock) {
    const stopReason = (payload as { stop_reason?: string })?.stop_reason;
    return {
      error: stopReason
        ? `Anthropic 응답에 text content가 없습니다. (stop_reason=${stopReason})`
        : "Anthropic 응답에 text content가 없습니다.",
    };
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
  /** 교내 공지 source_group (skku, yonsei …) — 대상 대학교 자동 채움 */
  sourceGroup?: string;
  /** 본문이 있어도 이미지 URL을 다시 긁고 싶을 때 */
  forceFetchImages?: boolean;
}): Promise<{
  draft?: NoticeDraft;
  error?: string;
  resolvedBody?: string;
  imageUrls?: string[];
}> {
  let normalizedBody = input.body?.trim() ?? "";
  let imageUrls: string[] = [];
  const shouldFetchDetail =
    Boolean(input.noticeUrl) &&
    (normalizedBody.length < 120 || Boolean(input.forceFetchImages));
  if (shouldFetchDetail && input.noticeUrl) {
    const fetched = await fetchNoticeDetailFromUrl(input.noticeUrl);
    if (fetched.content.length > normalizedBody.length) {
      normalizedBody = fetched.content;
    }
    imageUrls = fetched.imageUrls;
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

  const runExtract = async (prompt: string) =>
    callLlm({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: prompt,
      jsonObject: true,
      // Claude thinking 모델은 output budget을 thinking에 많이 쓰므로 여유를 둔다.
      maxTokens: 8192,
    });

  let { content, error: callError } = await runExtract(userPrompt);
  if (callError) return { error: callError, resolvedBody: normalizedBody, imageUrls };
  if (!content) {
    return {
      error: "LLM 응답 본문이 비어 있습니다.",
      resolvedBody: normalizedBody,
      imageUrls,
    };
  }

  let { parsed, error: parseError } = parseJsonObjectFromText(content);

  // 프로덕션에서 응답이 잘리거나 설명문이 섞이면 한 번 더 짧게 재시도
  if (parseError || parsed === undefined) {
    const retryPrompt = [
      userPrompt,
      "",
      "이전 응답이 유효한 JSON이 아니었습니다.",
      "설명·마크다운·코드펜스 없이 JSON 객체 하나만 다시 출력하세요.",
    ].join("\n");
    const retry = await runExtract(retryPrompt);
    if (!retry.error && retry.content) {
      const retried = parseJsonObjectFromText(retry.content);
      if (retried.parsed !== undefined) {
        parsed = retried.parsed;
        parseError = undefined;
      } else {
        content = retry.content;
        parseError = retried.error ?? parseError;
      }
    }
  }

  if (parseError || parsed === undefined) {
    return { error: parseError, resolvedBody: normalizedBody, imageUrls };
  }

  const draft = redistributeFreeformQualifiers(
    enrichQualifiers(normalizeDraft(parsed), {
      text: `${input.title}\n${promptBody}`,
      sourceName: input.sourceName,
      sourceGroup: input.sourceGroup,
    })
  );

  return {
    draft,
    resolvedBody: normalizedBody,
    imageUrls,
  };
}

/**
 * special_info / extra_requirements에 들어간 복합 문장에서
 * 국내·4년제·재학 등 구조화 필드를 채우고, 이미 반영된 문장은 기타에서 제거/축소.
 */
export function redistributeFreeformQualifiers(draft: NoticeDraft): NoticeDraft {
  const next: NoticeDraft = {
    ...draft,
    qual_special_info: [...(draft.qual_special_info ?? [])],
    qual_extra_requirements: [...(draft.qual_extra_requirements ?? [])],
  };

  const freeform: string[] = [];
  const keptSpecial: string[] = [];
  for (const item of next.qual_special_info ?? []) {
    if ((SPECIAL_INFO_VALUES as readonly string[]).includes(item)) {
      keptSpecial.push(item);
    } else {
      freeform.push(item);
    }
  }
  freeform.push(...(next.qual_extra_requirements ?? []));

  const residuals: string[] = [];
  for (const text of freeform) {
    const { residual, patch } = decomposeFreeformQualifier(text);
    applyQualifierPatch(next, patch);
    if (residual) residuals.push(residual);
  }

  next.qual_special_info = keptSpecial;
  next.qual_extra_requirements = [...new Set(residuals)].filter(Boolean);
  return next;
}

type QualifierPatch = {
  schoolLocation?: string[];
  schoolCategory?: string[];
  enrollment?: string[];
  academicYear?: number[];
  fieldCodes?: string[];
  gender?: string | null;
  nationality?: string | null;
  parentOccupation?: string[];
};

function applyQualifierPatch(draft: NoticeDraft, patch: QualifierPatch): void {
  if (patch.schoolLocation?.length) {
    draft.qual_school_location = [
      ...new Set([...(draft.qual_school_location ?? []), ...patch.schoolLocation]),
    ];
  }
  if (patch.schoolCategory?.length) {
    draft.qual_school_category = [
      ...new Set([...(draft.qual_school_category ?? []), ...patch.schoolCategory]),
    ];
  }
  if (patch.enrollment?.length) {
    draft.qual_enrollment_status = [
      ...new Set([...(draft.qual_enrollment_status ?? []), ...patch.enrollment]),
    ];
  }
  if (patch.academicYear?.length) {
    draft.qual_academic_year = [
      ...new Set([...(draft.qual_academic_year ?? []), ...patch.academicYear]),
    ].sort((a, b) => a - b);
  }
  if (patch.fieldCodes?.length) {
    draft.qual_field_codes = [
      ...new Set([...(draft.qual_field_codes ?? []), ...patch.fieldCodes]),
    ];
  }
  if (patch.gender && !draft.qual_gender) draft.qual_gender = patch.gender;
  if (patch.nationality && !draft.qual_nationality) {
    draft.qual_nationality = patch.nationality;
  }
  if (patch.parentOccupation?.length) {
    draft.qual_parent_occupation = [
      ...new Set([
        ...(draft.qual_parent_occupation ?? []),
        ...patch.parentOccupation,
      ]),
    ];
  }
}

/** 한 문장에서 구조화 가능 부분을 뽑고, 남는 문구만 residual로 반환 */
function decomposeFreeformQualifier(text: string): {
  residual: string | null;
  patch: QualifierPatch;
} {
  const original = text.trim();
  if (!original) return { residual: null, patch: {} };

  const patch: QualifierPatch = {};
  let working = original;

  const locHits = toSchoolLocationArray([working]);
  if (locHits.length) {
    patch.schoolLocation = locHits;
    working = working
      .replace(/국내\s*(?:\d년제\s*)?(?:대학(?:교)?|학부)/g, " ")
      .replace(/해외\s*(?:대학(?:교)?)/g, " ");
  }

  const catHits = toSchoolCategoryArray([original]);
  if (catHits.length) {
    patch.schoolCategory = catHits;
    working = working
      .replace(/4년제/g, " ")
      .replace(/전문대(?:학)?/g, " ")
      .replace(/대학원/g, " ")
      .replace(/사이버대/g, " ")
      .replace(/방통대|방송통신대학?/g, " ");
  }

  const enroll: string[] = [];
  if (/신입생/.test(original)) enroll.push("신입생");
  if (/재학생|학부\s*재학|재학\s*(?:중|必|필수)/.test(original)) enroll.push("재학");
  if (/휴학생|휴학\s*중/.test(original) && !/휴학\s*시|휴학할\s*경우/.test(original)) {
    enroll.push("휴학");
  }
  if (enroll.length) {
    patch.enrollment = toStringArray(enroll, ENROLLMENT_STATUSES);
    working = working
      .replace(/신입생/g, " ")
      .replace(/학부\s*재학생?/g, " ")
      .replace(/재학생/g, " ")
      .replace(/재학\s*(?:중|必|필수)?/g, " ");
  }

  if (/전학년|전체\s*학년|모든\s*학년/.test(original)) {
    patch.academicYear = [1, 2, 3, 4];
    working = working.replace(/전학년|전체\s*학년|모든\s*학년/g, " ");
  } else {
    const range = original.match(/([1-5])\s*[~\-–]\s*([1-5])\s*학년/);
    if (range) {
      patch.academicYear = toAcademicYearArray(range[0]);
      working = working.replace(range[0], " ");
    }
  }

  const fieldHits = toFieldCodeArray([original]);
  if (fieldHits.length) {
    patch.fieldCodes = fieldHits;
    working = working.replace(/이공계|이공\s*계열|인문계|인문\s*계열|예체능/g, " ");
  }

  if (/여학생만|여성만|여자대학생/.test(original)) {
    patch.gender = "여성";
    working = working.replace(/여학생만|여성만|여자대학생/g, " ");
  } else if (/남학생만|남성만/.test(original)) {
    patch.gender = "남성";
    working = working.replace(/남학생만|남성만/g, " ");
  }

  if (/외국인\s*근로자|외국인\s*노동자|외국인\s*노동자\s*자녀|외국인\s*근로자\s*자녀/.test(original)) {
    patch.parentOccupation = ["외국인 근로자"];
    working = working.replace(/외국인\s*근로자|외국인\s*노동자/g, " ");
  }

  const hadStructure =
    Boolean(patch.schoolLocation?.length) ||
    Boolean(patch.schoolCategory?.length) ||
    Boolean(patch.enrollment?.length) ||
    Boolean(patch.academicYear?.length) ||
    Boolean(patch.fieldCodes?.length) ||
    Boolean(patch.gender) ||
    Boolean(patch.parentOccupation?.length);

  // 구조화가 전혀 안 됐으면 원문 유지 (과도한 문자열 가공 금지)
  if (!hadStructure) {
    return { residual: original, patch: {} };
  }

  // 대학/학부 같은 잔여 일반어 제거 (구조화된 문장에만)
  working = working
    .replace(/대학(?:교)?/g, " ")
    .replace(/학부/g, " ")
    .replace(/학생/g, " ");

  let residual = working
    .replace(/[()（）\[\]【】]/g, " ")
    .replace(/[·•|/\\,_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (residual && /^(필수|必|대상|해당|이상|이하|만)?$/.test(residual)) {
    residual = "";
  }
  if (residual.length > 0 && residual.length < 8) {
    residual = "";
  }

  // 학기 조건처럼 의미 있는 residual은 유지
  const semesterNote = original.match(
    /\(([^)]*(?:학기|학년도)[^)]*)\)/
  )?.[1]?.trim();
  if (semesterNote) {
    const cleanedNote = semesterNote
      .replace(/재학\s*(?:必|필수)?/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleanedNote) residual = cleanedNote;
    else if (/학기|학년도/.test(semesterNote)) residual = semesterNote;
  }

  return { residual: residual || null, patch };
}

/** LLM이 빠뜨린 자격요건을 본문·출처로 보완 */
function enrichQualifiers(
  draft: NoticeDraft,
  ctx: { text: string; sourceName?: string; sourceGroup?: string }
): NoticeDraft {
  const source = ctx.text ?? "";
  const next = { ...draft };

  if (!next.qual_school_location?.length) {
    const inferred = toSchoolLocationArray(
      [
        /국내\s*(?:\d년제\s*)?(?:대학|대학교|학부)/.test(source)
          ? "국내 대학"
          : null,
        /해외\s*(?:대학|대학교)/.test(source) ? "해외 대학" : null,
      ].filter(Boolean)
    );
    if (inferred.length) next.qual_school_location = inferred;
  }
  if (!next.qual_school_category?.length) {
    const inferred = toSchoolCategoryArray(
      [
        /4년제|학부\s*재학|대학교\s*학부/.test(source) ? "4년제" : null,
        /전문대|전문대학/.test(source) ? "전문대" : null,
        /대학원/.test(source) ? "대학원" : null,
        /사이버대/.test(source) ? "사이버대" : null,
        /방통대|방송통신/.test(source) ? "방통대" : null,
      ].filter(Boolean)
    );
    if (inferred.length) next.qual_school_category = inferred;
  }

  if (!next.qual_enrollment_status?.length) {
    const enroll: string[] = [];
    if (/신입생/.test(source)) enroll.push("신입생");
    if (/재학생|재학\s*중|재학\s*必|재학\s*필수|학부\s*재학/.test(source)) {
      enroll.push("재학");
    }
    if (/휴학생|휴학\s*중/.test(source) && !/휴학\s*시\s*결격|휴학할\s*경우/.test(source)) {
      enroll.push("휴학");
    }
    if (enroll.length) {
      next.qual_enrollment_status = toStringArray(enroll, ENROLLMENT_STATUSES);
    }
  }

  if (!next.qual_academic_year?.length) {
    if (/전학년|전체\s*학년|모든\s*학년/.test(source)) {
      next.qual_academic_year = [1, 2, 3, 4];
    } else {
      const range = source.match(/([1-5])\s*[~\-–]\s*([1-5])\s*학년/);
      if (range) next.qual_academic_year = toAcademicYearArray(range[0]);
    }
  }

  if (next.qual_nationality == null) {
    // 지원자 본인 국적만. "부모 국적" 문맥은 건드리지 않음.
    if (/부모/.test(source) && /국적/.test(source) && !/유학생|외국인\s*학생/.test(source)) {
      // skip parent-nationality clauses
    } else if (/외국인\s*유학생|외국인\s*학생\s*대상|외국\s*국적\s*학생/.test(source)) {
      next.qual_nationality = "외국인";
    } else if (/내국인\s*만|대한민국\s*국적\s*소지|한국\s*국적\s*소지/.test(source)) {
      next.qual_nationality = "내국인";
    }
  }

  if (next.qual_gender == null) {
    if (/여학생만|여성만|여자대학생/.test(source)) next.qual_gender = "여성";
    else if (/남학생만|남성만/.test(source)) next.qual_gender = "남성";
  }

  if (!next.qual_field_codes?.length) {
    const inferred = toFieldCodeArray(
      [
        /이공계|이공\s*계열/.test(source) ? "이공계" : null,
        /인문계|인문\s*계열/.test(source) ? "인문" : null,
        /예체능/.test(source) ? "예체능" : null,
      ].filter(Boolean)
    );
    if (inferred.length) next.qual_field_codes = inferred;
  }

  if (!next.qual_parent_occupation?.length) {
    if (/외국인\s*근로자|외국인\s*노동자/.test(source)) {
      next.qual_parent_occupation = ["외국인 근로자"];
    }
  }

  // 교내 공지: 출처 대학을 대상 대학교로 채움 (본문에 다른 대학만 명시된 경우 제외)
  if (!next.qual_university?.length) {
    const group = (ctx.sourceGroup ?? "").toLowerCase();
    const fromGroup = SOURCE_GROUP_UNIVERSITY[group];
    if (fromGroup) next.qual_university = [fromGroup];
  }

  return next;
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
