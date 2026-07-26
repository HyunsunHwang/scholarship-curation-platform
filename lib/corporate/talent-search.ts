/**
 * 인재찾기 탐색 — 서버 전용 조회.
 *
 * 노출 원칙:
 * - is_profile_public = true 인 프로필만 조회 (기업 공개 동의)
 * - 민감 필드(연락처·주소·소득·특수정보·GPA·병역 등)는 select 자체에서 제외
 * - 이름은 서버에서 마스킹 후 전달
 */

import { createClient } from "@/lib/supabase/server";
import { computeProfileCompleteness } from "@/lib/profile-completeness";
import { normalizeArtifacts } from "@/lib/profile-artifacts";
import {
  expandInterestFilterIds,
  interestJobLabel,
  isInterestJobId,
} from "@/lib/interestCategories";
import { normalizeSkills } from "@/lib/skills";
import { experienceKindLabel } from "@/lib/profile-spec";
import type { SpecItemType } from "@/lib/database.types";
import {
  TALENT_PAGE_SIZE,
  type TalentFilters,
} from "@/lib/corporate/talent-params";

/** 인메모리 정렬·페이지네이션 대상 최대 후보 수 (초기 규모 전제) */
const CANDIDATE_LIMIT = 300;

export type TalentHighlight = {
  kindLabel: string;
  title: string;
  organization: string | null;
  period: string | null;
};

export type TalentCardData = {
  id: string;
  maskedName: string;
  avatarUrl: string | null;
  headline: string | null;
  schoolLine: string;
  yearStatusLine: string;
  isOpenToOffers: boolean;
  highlights: TalentHighlight[];
  certifications: string[];
  certOverflow: number;
  languages: string[];
  languageOverflow: number;
  skills: string[];
  skillOverflow: number;
  interestJobLabels: string[];
  /** 예: "오늘 업데이트", "3일 전 업데이트" */
  updatedAgo: string;
  /** 예: "2시간 전 활동" — 현재는 profile.updated_at 기준 */
  activeAgo: string;
};

export type TalentSearchResult = {
  items: TalentCardData[];
  total: number;
  page: number;
  totalPages: number;
};

function maskName(name: string | null): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return "이름 미공개";
  if (trimmed.length === 1) return `${trimmed}*`;
  if (trimmed.length === 2) return `${trimmed[0]}*`;
  return `${trimmed[0]}${"*".repeat(trimmed.length - 2)}${trimmed[trimmed.length - 1]}`;
}

function formatYearMonth(date: string | null): string | null {
  if (!date) return null;
  const [y, m] = date.split("-");
  if (!y || !m) return null;
  return `${y}.${m}`;
}

function formatPeriod(
  start: string | null,
  end: string | null,
  isCurrent: boolean,
): string | null {
  const startLabel = formatYearMonth(start);
  if (!startLabel) return null;
  const endLabel = isCurrent ? "진행 중" : formatYearMonth(end);
  return endLabel ? `${startLabel} ~ ${endLabel}` : startLabel;
}

/** 상대 시각 라벨 — suffix는 "업데이트" | "활동" */
function formatRelativeAgo(
  isoDate: string,
  suffix: "업데이트" | "활동",
): string {
  const diffMs = Math.max(0, Date.now() - new Date(isoDate).getTime());
  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 1) return `방금 ${suffix}`;
  if (minutes < 60) return `${minutes}분 전 ${suffix}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전 ${suffix}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? `어제 ${suffix}` : `${days}일 전 ${suffix}`;
  if (days < 30) return `${Math.floor(days / 7)}주 전 ${suffix}`;
  return `${Math.floor(days / 30)}개월 전 ${suffix}`;
}

type SpecRow = {
  id: string;
  user_id: string;
  item_type: SpecItemType;
  title: string;
  organization: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  artifacts: unknown;
  sort_order: number;
};

/** 카드 하이라이트 우선순위 — 경력/성과 줄. 자격증·언어는 별도 목록으로 처리 */
const HIGHLIGHT_PRIORITY: SpecItemType[] = [
  "experience",
  "award",
  "project",
  "activity",
];

/** 스킬·자격증·언어 카드에 노출할 최대 개수 (초과분은 +N) */
const TAG_VISIBLE = 4;

function pickHighlights(items: SpecRow[]): TalentHighlight[] {
  const highlights: TalentHighlight[] = [];
  for (const type of HIGHLIGHT_PRIORITY) {
    const item = items.find((i) => i.item_type === type);
    if (!item) continue;
    highlights.push({
      kindLabel: experienceKindLabel(type),
      title: item.title,
      organization: item.organization,
      period: formatPeriod(item.start_date, item.end_date, item.is_current),
    });
    if (highlights.length >= 3) break;
  }
  return highlights;
}

function pickTaggedTitles(
  items: SpecRow[],
  type: "certification" | "language",
): { titles: string[]; overflow: number } {
  const titles = items
    .filter((i) => i.item_type === type)
    .map((i) => i.title.trim())
    .filter(Boolean);
  return {
    titles: titles.slice(0, TAG_VISIBLE),
    overflow: Math.max(0, titles.length - TAG_VISIBLE),
  };
}

export async function searchTalent(
  filters: TalentFilters,
): Promise<TalentSearchResult> {
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select(
      "id, name, headline, bio, avatar_url, school_name, department, has_double_major, double_major_department, academic_year, enrollment_status, skills, interest_categories, is_open_to_offers, updated_at",
    )
    .eq("is_profile_public", true)
    .eq("is_onboarded", true)
    .order("updated_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (filters.schoolCategories.length > 0)
    query = query.in("school_category", filters.schoolCategories);
  if (filters.years.length > 0)
    query = query.in("academic_year", filters.years);
  if (filters.statuses.length > 0)
    query = query.in("enrollment_status", filters.statuses);
  if (filters.activelySeeking) query = query.eq("is_open_to_offers", true);
  if (filters.skills.length > 0)
    query = query.overlaps("skills", filters.skills);
  if (filters.industries.length > 0)
    query = query.overlaps("interest_industries", filters.industries);

  const jobIds = expandInterestFilterIds(filters.jobs);
  if (jobIds.length > 0)
    query = query.overlaps("interest_categories", jobIds);

  const { data: profileRows, error } = await query;
  if (error) throw new Error(`인재 조회 실패: ${error.message}`);

  const profiles = profileRows ?? [];
  const userIds = profiles.map((p) => p.id);

  let specByUser = new Map<string, SpecRow[]>();
  if (userIds.length > 0) {
    const { data: specRows, error: specError } = await supabase
      .from("profile_spec_items")
      .select(
        "id, user_id, item_type, title, organization, start_date, end_date, is_current, artifacts, sort_order",
      )
      .in("user_id", userIds)
      .order("sort_order", { ascending: true });
    if (specError) throw new Error(`스펙 조회 실패: ${specError.message}`);

    specByUser = (specRows ?? []).reduce((map, row) => {
      const list = map.get(row.user_id);
      if (list) list.push(row as SpecRow);
      else map.set(row.user_id, [row as SpecRow]);
      return map;
    }, new Map<string, SpecRow[]>());
  }

  let candidates = profiles.map((profile) => {
    const items = specByUser.get(profile.id) ?? [];
    const interestJobs = (profile.interest_categories ?? []).filter(
      isInterestJobId,
    );
    const skills = normalizeSkills(profile.skills);

    const completeness = computeProfileCompleteness({
      headline: profile.headline,
      bio: profile.bio,
      interest_categories: interestJobs,
      skills,
      items: items.map((row) => ({
        id: row.id,
        item_type: row.item_type,
        title: row.title,
        organization: row.organization,
        description: null,
        start_date: row.start_date,
        end_date: row.end_date,
        is_current: row.is_current,
        star_role: null,
        star_action: null,
        star_result: null,
        skills: [],
        artifacts: normalizeArtifacts(row.artifacts),
      })),
    });

    return { profile, items, interestJobs, skills, completeness };
  });

  // 신입/경력 — 둘 다 고르면 전체와 동일하므로 스킵
  const wantNew = filters.careerLevels.includes("new");
  const wantExp = filters.careerLevels.includes("exp");
  if (wantNew !== wantExp) {
    candidates = candidates.filter(({ items }) => {
      const hasExperience = items.some((i) => i.item_type === "experience");
      return wantExp ? hasExperience : !hasExperience;
    });
  }

  // 재직중 제외 — 현재 진행 중인 경력(experience + is_current)이 있는 인재 제외
  if (filters.excludeEmployed) {
    candidates = candidates.filter(
      ({ items }) =>
        !items.some(
          (i) => i.item_type === "experience" && i.is_current === true,
        ),
    );
  }

  if (filters.sort === "completeness") {
    candidates.sort((a, b) => {
      if (b.completeness.percent !== a.completeness.percent)
        return b.completeness.percent - a.completeness.percent;
      return (
        new Date(b.profile.updated_at).getTime() -
        new Date(a.profile.updated_at).getTime()
      );
    });
  }

  const total = candidates.length;
  const totalPages = Math.max(1, Math.ceil(total / TALENT_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const pageItems = candidates.slice(
    (page - 1) * TALENT_PAGE_SIZE,
    page * TALENT_PAGE_SIZE,
  );

  const items: TalentCardData[] = pageItems.map(
    ({ profile, items: specItems, interestJobs, skills, completeness }) => {
      const schoolParts = [
        profile.school_name,
        profile.department,
        profile.has_double_major && profile.double_major_department
          ? `복수전공 ${profile.double_major_department}`
          : null,
      ].filter(Boolean);

      const yearLabel =
        profile.academic_year != null
          ? profile.academic_year >= 5
            ? "5학년 이상"
            : `${profile.academic_year}학년`
          : null;
      const yearStatusParts = [yearLabel, profile.enrollment_status].filter(
        Boolean,
      );

      const bioSummary = profile.bio?.trim().replace(/\s+/g, " ") ?? "";
      const certifications = pickTaggedTitles(specItems, "certification");
      const languages = pickTaggedTitles(specItems, "language");

      return {
        id: profile.id,
        maskedName: maskName(profile.name),
        avatarUrl: profile.avatar_url,
        headline:
          profile.headline?.trim() ||
          (bioSummary ? bioSummary.slice(0, 100) : null),
        schoolLine: schoolParts.join(" · "),
        yearStatusLine: yearStatusParts.join(" · "),
        isOpenToOffers: profile.is_open_to_offers,
        highlights: pickHighlights(specItems),
        certifications: certifications.titles,
        certOverflow: certifications.overflow,
        languages: languages.titles,
        languageOverflow: languages.overflow,
        skills: skills.slice(0, TAG_VISIBLE),
        skillOverflow: Math.max(0, skills.length - TAG_VISIBLE),
        interestJobLabels: interestJobs.slice(0, 3).map(interestJobLabel),
        updatedAgo: formatRelativeAgo(profile.updated_at, "업데이트"),
        // 로그인/세션 활동 시각이 생기면 교체. 당분간 프로필 갱신 시각을 활동 프록시로 사용.
        activeAgo: formatRelativeAgo(profile.updated_at, "활동"),
      };
    },
  );

  return { items, total, page, totalPages };
}
