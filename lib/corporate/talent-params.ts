/**
 * 인재찾기 탐색 필터 — URL 파라미터 파싱/직렬화.
 * 서버 페이지와 클라이언트 사이드바가 공유하는 순수 모듈 (서버 의존성 금지).
 */

import {
  INTEREST_CATEGORIES,
  isInterestCategoryId,
  isInterestJobId,
} from "@/lib/interestCategories";
import {
  isInterestIndustryId,
  type InterestIndustryId,
} from "@/lib/interestIndustries";
import { SKILL_CATALOG } from "@/lib/skills";
import type {
  EnrollmentStatusType,
  SchoolCategoryType,
} from "@/lib/database.types";

export const TALENT_PAGE_SIZE = 10;

export type TalentSort = "recent" | "completeness";

export type TalentFilters = {
  schoolCategories: SchoolCategoryType[];
  years: number[];
  statuses: EnrollmentStatusType[];
  /**
   * 채용 포지션 — 대분류 id("전체" 선택)와 세부 직무 id 혼합.
   * 쿼리 시 expandInterestFilterIds 로 세부 직무로 확장.
   */
  jobs: string[];
  industries: InterestIndustryId[];
  skills: string[];
  hasInternship: boolean;
  openToOffers: boolean;
  sort: TalentSort;
  page: number;
};

export const SCHOOL_CATEGORY_OPTIONS: SchoolCategoryType[] = [
  "4년제",
  "전문대",
  "대학원",
  "사이버대",
  "방통대",
];

export const YEAR_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1학년" },
  { value: 2, label: "2학년" },
  { value: 3, label: "3학년" },
  { value: 4, label: "4학년" },
  { value: 5, label: "5학년 이상" },
];

export const ENROLLMENT_STATUS_OPTIONS: EnrollmentStatusType[] = [
  "재학",
  "휴학",
  "수료",
  "졸업예정",
  "졸업",
];

export const JOB_CATEGORY_OPTIONS = INTEREST_CATEGORIES;

const SKILL_SET: ReadonlySet<string> = new Set(SKILL_CATALOG);
const SCHOOL_CATEGORY_SET: ReadonlySet<string> = new Set(
  SCHOOL_CATEGORY_OPTIONS,
);
const STATUS_SET: ReadonlySet<string> = new Set([
  ...ENROLLMENT_STATUS_OPTIONS,
  "신입생",
  "초과이수기",
]);

type RawSearchParams = Record<string, string | string[] | undefined>;

function readList(raw: RawSearchParams, key: string): string[] {
  const value = raw[key];
  const joined = Array.isArray(value) ? value.join(",") : (value ?? "");
  return joined
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function parseTalentSearchParams(raw: RawSearchParams): TalentFilters {
  const years = readList(raw, "year")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);

  const sortRaw = Array.isArray(raw.sort) ? raw.sort[0] : raw.sort;
  const pageRaw = Number(Array.isArray(raw.page) ? raw.page[0] : raw.page);

  return {
    schoolCategories: readList(raw, "school").filter((v): v is SchoolCategoryType =>
      SCHOOL_CATEGORY_SET.has(v),
    ),
    years,
    statuses: readList(raw, "status").filter((v): v is EnrollmentStatusType =>
      STATUS_SET.has(v),
    ),
    jobs: readList(raw, "jobs").filter(
      (v) => isInterestCategoryId(v) || isInterestJobId(v),
    ),
    industries: readList(raw, "industries").filter(isInterestIndustryId),
    skills: readList(raw, "skills").filter((v) => SKILL_SET.has(v)),
    hasInternship: (Array.isArray(raw.intern) ? raw.intern[0] : raw.intern) === "1",
    openToOffers: (Array.isArray(raw.offers) ? raw.offers[0] : raw.offers) === "1",
    sort: sortRaw === "completeness" ? "completeness" : "recent",
    page: Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1,
  };
}

/** 정렬 탭·페이지네이션 링크용 쿼리스트링 생성 */
export function talentFiltersToQuery(
  filters: TalentFilters,
  overrides: Partial<Pick<TalentFilters, "sort" | "page">> = {},
): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();

  if (merged.schoolCategories.length)
    params.set("school", merged.schoolCategories.join(","));
  if (merged.years.length) params.set("year", merged.years.join(","));
  if (merged.statuses.length) params.set("status", merged.statuses.join(","));
  if (merged.jobs.length) params.set("jobs", merged.jobs.join(","));
  if (merged.industries.length)
    params.set("industries", merged.industries.join(","));
  if (merged.skills.length) params.set("skills", merged.skills.join(","));
  if (merged.hasInternship) params.set("intern", "1");
  if (merged.openToOffers) params.set("offers", "1");
  if (merged.sort !== "recent") params.set("sort", merged.sort);
  if (merged.page > 1) params.set("page", String(merged.page));

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function hasActiveTalentFilters(filters: TalentFilters): boolean {
  return (
    filters.schoolCategories.length > 0 ||
    filters.years.length > 0 ||
    filters.statuses.length > 0 ||
    filters.jobs.length > 0 ||
    filters.industries.length > 0 ||
    filters.skills.length > 0 ||
    filters.hasInternship ||
    filters.openToOffers
  );
}
