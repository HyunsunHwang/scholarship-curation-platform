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
  isProfileComplete: boolean;
  isRecentlyActive: boolean;
  highlights: TalentHighlight[];
  skills: string[];
  skillOverflow: number;
  interestJobLabels: string[];
  completenessPercent: number;
  updatedAgo: string;
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

function formatUpdatedAgo(updatedAt: string): string {
  const diffMs = Date.now() - new Date(updatedAt).getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return "오늘 업데이트";
  if (days < 7) return `${days}일 전 업데이트`;
  if (days < 30) return `${Math.floor(days / 7)}주 전 업데이트`;
  return `${Math.floor(days / 30)}개월 전 업데이트`;
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

/** 카드 하이라이트 우선순위 — 그룹바이의 경력/성과/연구 줄에 대응 */
const HIGHLIGHT_PRIORITY: SpecItemType[] = [
  "experience",
  "award",
  "project",
  "activity",
  "certification",
  "language",
];

function highlightKindLabel(type: SpecItemType): string {
  if (type === "certification") return "자격증";
  if (type === "language") return "언어";
  return experienceKindLabel(type);
}

function pickHighlights(items: SpecRow[]): TalentHighlight[] {
  const highlights: TalentHighlight[] = [];
  for (const type of HIGHLIGHT_PRIORITY) {
    const item = items.find((i) => i.item_type === type);
    if (!item) continue;
    const titleOnly = type === "certification" || type === "language";
    highlights.push({
      kindLabel: highlightKindLabel(type),
      title: item.title,
      organization: titleOnly ? null : item.organization,
      period: titleOnly
        ? null
        : formatPeriod(item.start_date, item.end_date, item.is_current),
    });
    if (highlights.length >= 3) break;
  }
  return highlights;
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
  if (filters.openToOffers) query = query.eq("is_open_to_offers", true);
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

  const RECENT_ACTIVE_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

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

  if (filters.hasInternship) {
    candidates = candidates.filter(({ items }) =>
      items.some((i) => i.item_type === "experience"),
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
        isProfileComplete: completeness.percent >= 70,
        isRecentlyActive:
          now - new Date(profile.updated_at).getTime() <= RECENT_ACTIVE_MS,
        highlights: pickHighlights(specItems),
        skills: skills.slice(0, 4),
        skillOverflow: Math.max(0, skills.length - 4),
        interestJobLabels: interestJobs.slice(0, 3).map(interestJobLabel),
        completenessPercent: completeness.percent,
        updatedAgo: formatUpdatedAgo(profile.updated_at),
      };
    },
  );

  return { items, total, page, totalPages };
}
