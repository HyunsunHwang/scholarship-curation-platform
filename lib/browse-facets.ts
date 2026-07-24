/**
 * 탐색 목록 세부 필터 — 실제 DB 값에 맞춘 택소노미.
 * (관심 직무·혜택·주최기관 + 검색. 참여대상은 대학생 전용으로 고정되어 UI에서 제외)
 */

import {
  BENEFIT_CATEGORIES,
  type BenefitCategoryId,
} from "@/lib/benefit-categories";
import {
  INTEREST_CATEGORIES,
  isInterestCategoryId,
  type InterestCategoryId,
} from "@/lib/interestCategories";
import { fieldCodesForInterest } from "@/lib/interest-field-map";

/** browse-data의 BrowseKind / BrowseSection과 동일 — 순환 import 방지 */
type BrowseKind = "all" | "contest" | "education" | "activity" | "scholarship";
type BrowseSection = "all" | "trending" | "internship" | "hiring";

/** 공모전·대외활동·교육 organization_type (링커리어 유입값) */
export const CONTEST_ORG_TYPES = [
  "공공기관/공기업",
  "비영리단체/협회/재단",
  "대기업",
  "중견기업",
  "중소기업",
  "스타트업",
  "외국계기업",
  "금융권",
  "병원",
  "동아리/학생자치단체",
  "기타",
] as const;

/** 장학금 institution_type */
export const SCHOLARSHIP_ORG_TYPES = [
  "국가기관",
  "지방자치단체",
  "공공기관",
  "기업",
  "재단법인",
  "학교법인",
  "언론/방송",
  "종교단체",
  "기타",
] as const;

/** contests.targets — UI 필터에서는 쓰지 않음(대학생 전용 정책) */

export type BrowseFacetTab = "interest" | "benefit" | "org";

export type BrowseFacetFilters = {
  interests: InterestCategoryId[];
  benefits: BenefitCategoryId[];
  orgs: string[];
  q: string;
};

export const EMPTY_BROWSE_FACETS: BrowseFacetFilters = {
  interests: [],
  benefits: [],
  orgs: [],
  q: "",
};

/** 링커리어 exact map + 정규화 라벨 → 필터용 raw benefits[] 태그 */
const EXACT_BENEFIT_REVERSE: Record<string, BenefitCategoryId[]> = {
  "상장 수여": ["award"],
  실제상용화: ["commercialization"],
  "해외연수, 전시기회": ["overseas", "exhibition"],
  "인턴/정규직채용": ["internship", "hiring"],
  "입사시 가산점": ["hiring_bonus"],
  상품: ["goods"],
  "상품 지급": ["goods"],
  "상품 제공": ["goods"],
  "상품 수여": ["goods"],
  경품: ["goods"],
  "경품 지급": ["goods"],
  현물: ["goods"],
  시상품: ["goods"],
  부상: ["goods"],
  "수료증 및 인증서": ["certificate"],
  봉사활동시간: ["volunteer_hours"],
  활동비: ["activity_fee"],
  "행사 참여": ["event"],
  "사은품 지급": ["goods"],
  사은품: ["goods"],
  "실무 교육": ["training"],
  "전문가/임직원 멘토링": ["mentoring"],
  교통비: ["transport_fee"],
  "인턴쉽 기회": ["internship"],
  "입사시 혜택": ["hiring_perk"],
};

const BENEFIT_ID_TO_RAW_TAGS: Record<BenefitCategoryId, string[]> = (() => {
  const map = Object.fromEntries(
    BENEFIT_CATEGORIES.map((c) => [c.id, [c.label] as string[]])
  ) as Record<BenefitCategoryId, string[]>;

  for (const [raw, ids] of Object.entries(EXACT_BENEFIT_REVERSE)) {
    for (const id of ids) {
      if (!map[id].includes(raw)) map[id].push(raw);
    }
  }

  // DB에 자주 보이는 정규화·동의어 보강
  const extras: Partial<Record<BenefitCategoryId, string[]>> = {
    award: ["상장"],
    certificate: ["수료증"],
    volunteer_hours: ["봉사시간"],
    training: ["실무교육"],
    mentoring: ["멘토링"],
    goods: ["상품"],
    prize: ["상금"],
    internship: ["인턴십", "인턴쉽 기회"],
    hiring: ["채용연계"],
    hiring_bonus: ["입사 가산점", "입사시 가산점"],
    hiring_perk: ["입사혜택", "입사시 혜택"],
    exhibition: ["전시·발표"],
    publication: ["게재·출간"],
    networking: ["교류"],
    lodging: ["숙식"],
    event: ["행사 참여"],
    commercialization: ["상용화", "실제상용화"],
    overseas: ["해외연수"],
    free_edu: ["무료교육"],
    job_support: ["취업지원"],
    appointment: ["위촉장"],
    discount: ["할인"],
  };
  for (const [id, tags] of Object.entries(extras) as [
    BenefitCategoryId,
    string[],
  ][]) {
    for (const t of tags) {
      if (!map[id].includes(t)) map[id].push(t);
    }
  }

  return map;
})();

/** 장학금 support_types 라벨 */
const BENEFIT_TO_SUPPORT_TYPE: Partial<Record<BenefitCategoryId, string>> = {
  tuition: "등록금",
  living: "생활비",
  academic: "학업장려금",
  research: "연구비",
  overseas_fee: "해외연수비",
  other: "기타",
};

export function rawBenefitTagsForIds(ids: BenefitCategoryId[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    for (const tag of BENEFIT_ID_TO_RAW_TAGS[id] ?? []) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

export function supportTypesForBenefitIds(ids: BenefitCategoryId[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const t = BENEFIT_TO_SUPPORT_TYPE[id];
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export function fieldCodesForInterestIds(
  ids: readonly (InterestCategoryId | string)[]
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    for (const code of fieldCodesForInterest(id)) {
      if (seen.has(code)) continue;
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

function parseCsv(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBenefitIds(raw: string | null | undefined): BenefitCategoryId[] {
  const allowed = new Set(BENEFIT_CATEGORIES.map((c) => c.id));
  const out: BenefitCategoryId[] = [];
  const seen = new Set<string>();
  for (const v of parseCsv(raw)) {
    if (!allowed.has(v as BenefitCategoryId) || seen.has(v)) continue;
    seen.add(v);
    out.push(v as BenefitCategoryId);
  }
  return out;
}

function parseInterestIds(
  raw: string | null | undefined
): InterestCategoryId[] {
  const out: InterestCategoryId[] = [];
  const seen = new Set<string>();
  for (const v of parseCsv(raw)) {
    if (!isInterestCategoryId(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function parseBrowseFacets(searchParams: {
  interest?: string;
  benefit?: string;
  org?: string;
  q?: string;
}): BrowseFacetFilters {
  return {
    interests: parseInterestIds(searchParams.interest),
    benefits: parseBenefitIds(searchParams.benefit),
    orgs: parseCsv(searchParams.org), // kind별 허용 목록은 UI/적용 시 검증
    q: (searchParams.q ?? "").trim().slice(0, 80),
  };
}

export function hasBrowseFacets(f: BrowseFacetFilters): boolean {
  return (
    f.interests.length > 0 ||
    f.benefits.length > 0 ||
    f.orgs.length > 0 ||
    f.q.length > 0
  );
}

export function browseFacetsToSearchParams(
  f: BrowseFacetFilters
): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.interests.length) out.interest = f.interests.join(",");
  if (f.benefits.length) out.benefit = f.benefits.join(",");
  if (f.orgs.length) out.org = f.orgs.join(",");
  if (f.q) out.q = f.q;
  return out;
}

export function facetTabsFor(
  kind: BrowseKind,
  _section: BrowseSection
): { key: BrowseFacetTab; label: string }[] {
  const isScholarship = kind === "scholarship";

  return [
    { key: "interest", label: "관심 직무" },
    {
      key: "benefit",
      label: isScholarship ? "지원유형" : "활동혜택",
    },
    { key: "org", label: "주최기관" },
  ];
}

export function facetOptionsFor(
  tab: BrowseFacetTab,
  kind: BrowseKind
): { id: string; label: string }[] {
  if (tab === "interest") {
    return INTEREST_CATEGORIES.map((c) => ({ id: c.id, label: c.label }));
  }
  if (tab === "benefit") {
    if (kind === "scholarship") {
      return BENEFIT_CATEGORIES.filter((c) =>
        Boolean(BENEFIT_TO_SUPPORT_TYPE[c.id])
      ).map((c) => ({ id: c.id, label: c.label }));
    }
    // 목록에서 자주 쓰이는 혜택 우선 노출 (전체 중 핵심)
    const preferred: BenefitCategoryId[] = [
      "prize",
      "award",
      "goods",
      "activity_fee",
      "certificate",
      "volunteer_hours",
      "mentoring",
      "training",
      "internship",
      "hiring",
      "hiring_bonus",
      "event",
      "exhibition",
      "overseas",
      "lodging",
      "networking",
      "free_edu",
      "job_support",
      "appointment",
      "transport_fee",
    ];
    const byId = Object.fromEntries(
      BENEFIT_CATEGORIES.map((c) => [c.id, c.label])
    ) as Record<BenefitCategoryId, string>;
    return preferred.map((id) => ({ id, label: byId[id] }));
  }
  // org
  if (kind === "scholarship") {
    return SCHOLARSHIP_ORG_TYPES.map((t) => ({ id: t, label: t }));
  }
  return CONTEST_ORG_TYPES.map((t) => ({ id: t, label: t }));
}

export function searchPlaceholder(kind: BrowseKind): string {
  if (kind === "scholarship") return "장학금명, 기관 검색";
  if (kind === "contest") return "공모전명, 분야, 혜택 검색";
  if (kind === "education") return "교육명, 분야, 혜택 검색";
  if (kind === "activity") return "활동명, 분야, 혜택 검색";
  return "공고명, 기관, 혜택 검색";
}

/** 검색어 제외 — 필터 버튼 배지용 */
export function countBrowseFacetSelections(f: BrowseFacetFilters): number {
  return f.interests.length + f.benefits.length + f.orgs.length;
}

export type BrowseFacetChip = {
  /** 제거용 고유 키 */
  key: string;
  dimension: BrowseFacetTab | "q";
  id: string;
  label: string;
};

export function listBrowseFacetChips(
  f: BrowseFacetFilters,
  _kind: BrowseKind
): BrowseFacetChip[] {
  const chips: BrowseFacetChip[] = [];
  const interestLabel = Object.fromEntries(
    INTEREST_CATEGORIES.map((c) => [c.id, c.label])
  );
  const benefitLabel = Object.fromEntries(
    BENEFIT_CATEGORIES.map((c) => [c.id, c.label])
  );

  for (const id of f.interests) {
    chips.push({
      key: `interest:${id}`,
      dimension: "interest",
      id,
      label: interestLabel[id] ?? id,
    });
  }
  for (const id of f.benefits) {
    chips.push({
      key: `benefit:${id}`,
      dimension: "benefit",
      id,
      label: benefitLabel[id] ?? id,
    });
  }
  for (const id of f.orgs) {
    chips.push({
      key: `org:${id}`,
      dimension: "org",
      id,
      label: id,
    });
  }
  if (f.q) {
    chips.push({
      key: `q:${f.q}`,
      dimension: "q",
      id: f.q,
      label: `"${f.q}"`,
    });
  }
  return chips;
}

export function removeBrowseFacetChip(
  f: BrowseFacetFilters,
  chip: BrowseFacetChip
): BrowseFacetFilters {
  if (chip.dimension === "interest") {
    return {
      ...f,
      interests: f.interests.filter((x) => x !== chip.id),
    };
  }
  if (chip.dimension === "benefit") {
    return {
      ...f,
      benefits: f.benefits.filter((x) => x !== chip.id),
    };
  }
  if (chip.dimension === "org") {
    return { ...f, orgs: f.orgs.filter((x) => x !== chip.id) };
  }
  return { ...f, q: "" };
}

/** PostgREST or()용 ilike 이스케이프 */
export function escapeIlike(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}
