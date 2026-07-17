import type { CardScholarship } from "@/components/ScholarshipCard";
import type { Database } from "@/lib/database.types";
import {
  daysUntilApplyDeadlineKorea,
  isScholarshipExpired,
} from "@/lib/scholarship-dates";
import { isUniversitySpecificScholarship } from "@/lib/scholarship-university";
import { getCachedUniversityNames } from "@/lib/public-data";
import { getScholarshipScrapCounts } from "@/lib/scholarship-scrap-counts";
import { createClient } from "@/lib/supabase/server";

/** 맞춤 페이지에 hydrate하는 카드 상한 — 전체 RPC 결과를 클라이언트로 보내지 않음 */
export const MATCHED_HYDRATION_LIMIT = 96;

export type MatchedScopeCounts = {
  all: number;
  campus: number;
  external: number;
};

export type MatchedPageData = {
  scholarships: CardScholarship[];
  totalCount: number;
  scopeCounts: MatchedScopeCounts;
  errorMessage: string | null;
};

type ScholarshipRow = Database["public"]["Tables"]["scholarships"]["Row"];

function compareRecommendedPinned(a: CardScholarship, b: CardScholarship): number {
  const ar = a.is_recommended ? 1 : 0;
  const br = b.is_recommended ? 1 : 0;
  if (ar !== br) return br - ar;
  const ao = a.recommended_sort_order;
  const bo = b.recommended_sort_order;
  if (ao == null && bo == null) return 0;
  if (ao == null) return 1;
  if (bo == null) return -1;
  return ao - bo;
}

function sortMatchedCards(cards: CardScholarship[]): CardScholarship[] {
  return [...cards].sort((a, b) => {
    const pin = compareRecommendedPinned(a, b);
    if (pin !== 0) return pin;
    return (
      daysUntilApplyDeadlineKorea(a.apply_end_date) -
      daysUntilApplyDeadlineKorea(b.apply_end_date)
    );
  });
}

/** 상한 적용 시 교내/교외가 한쪽으로 쏠리지 않도록 최소 할당 후 정렬순으로 채움 */
function pickHydrationSet(
  sorted: CardScholarship[],
  limit: number
): CardScholarship[] {
  if (sorted.length <= limit) return sorted;

  const campus = sorted.filter((s) => s.scope === "campus");
  const external = sorted.filter((s) => s.scope === "external");
  const reserveEach = Math.floor(limit / 3);

  const reservedIds = new Set<number>([
    ...campus.slice(0, Math.min(reserveEach, campus.length)).map((s) => s.id),
    ...external.slice(0, Math.min(reserveEach, external.length)).map((s) => s.id),
  ]);

  const picked: CardScholarship[] = [];
  const pickedIds = new Set<number>();

  for (const s of sorted) {
    if (!reservedIds.has(s.id)) continue;
    picked.push(s);
    pickedIds.add(s.id);
  }
  for (const s of sorted) {
    if (picked.length >= limit) break;
    if (pickedIds.has(s.id)) continue;
    picked.push(s);
    pickedIds.add(s.id);
  }

  return sortMatchedCards(picked);
}

/**
 * 맞춤 장학금 로드.
 * RPC 전체는 서버에서만 다룬 뒤 마감임박·추천 순으로 상한을 잘라 hydrate한다.
 * scrap_count는 hydrate 대상에만 조회한다.
 */
export async function loadMatchedPageData(
  userId: string
): Promise<MatchedPageData> {
  const supabase = await createClient();
  const [{ data: matched, error }, universityNames] = await Promise.all([
    supabase.rpc("get_matched_scholarships", { p_user_id: userId }),
    getCachedUniversityNames(),
  ]);

  if (error) {
    return {
      scholarships: [],
      totalCount: 0,
      scopeCounts: { all: 0, campus: 0, external: 0 },
      errorMessage: error.message,
    };
  }

  const rows = (matched ?? []) as ScholarshipRow[];
  const cards: CardScholarship[] = rows
    .filter((s) => !isScholarshipExpired(s.apply_end_date))
    .map((s) => ({
      id: s.id,
      name: s.name,
      organization: s.organization,
      institution_type: s.institution_type,
      support_types: s.support_types as string[],
      support_amount_text: s.support_amount_text,
      apply_end_date: s.apply_end_date,
      poster_image_url: s.poster_image_url ?? null,
      created_at: s.created_at,
      view_count: s.view_count,
      scrap_count: 0,
      scope: isUniversitySpecificScholarship(s, universityNames)
        ? ("campus" as const)
        : ("external" as const),
      is_recommended: s.is_recommended,
      recommended_sort_order: s.recommended_sort_order,
      is_advertisement: s.is_advertisement,
    }));

  const scopeCounts: MatchedScopeCounts = {
    all: cards.length,
    campus: cards.filter((s) => s.scope === "campus").length,
    external: cards.filter((s) => s.scope === "external").length,
  };

  const hydrated = pickHydrationSet(
    sortMatchedCards(cards),
    MATCHED_HYDRATION_LIMIT
  );
  const scrapCountByScholarship = await getScholarshipScrapCounts(
    supabase,
    hydrated.map((s) => s.id)
  );

  return {
    scholarships: hydrated.map((s) => ({
      ...s,
      scrap_count: scrapCountByScholarship.get(s.id) ?? 0,
    })),
    totalCount: cards.length,
    scopeCounts,
    errorMessage: null,
  };
}
