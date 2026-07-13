import { createClient } from "@/lib/supabase/server";
import type { CardScholarship } from "@/components/ScholarshipCard";
import { isScholarshipExpired } from "@/lib/scholarship-dates";
import { cardBookmarkKey } from "@/lib/bookmark-keys";

export { cardBookmarkKey } from "@/lib/bookmark-keys";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getBookmarkedScholarshipIds(
  supabase: SupabaseServerClient,
  userId: string
) {
  const { data: bookmarkRows } = await supabase
    .from("bookmarks")
    .select("scholarship_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (bookmarkRows ?? []).map((row) => row.scholarship_id as number);
}

export async function getBookmarkedContestIds(
  supabase: SupabaseServerClient,
  userId: string
) {
  const { data: bookmarkRows } = await supabase
    .from("contest_bookmarks")
    .select("contest_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (bookmarkRows ?? []).map((row) => row.contest_id as number);
}

/** 홈 카드 initialBookmarked용 복합 키 목록 */
export async function getBookmarkedCardKeys(
  supabase: SupabaseServerClient,
  userId: string
): Promise<string[]> {
  const [scholarshipIds, contestIds] = await Promise.all([
    getBookmarkedScholarshipIds(supabase, userId),
    getBookmarkedContestIds(supabase, userId),
  ]);
  return [
    ...scholarshipIds.map((id) => cardBookmarkKey({ id, content_kind: "scholarship" })),
    ...contestIds.map((id) => cardBookmarkKey({ id, content_kind: "contest" })),
  ];
}

/** 홈 라이브러리용 — 북마크 공고 카드 데이터 (최신 담은 순, 마감 제외) */
export async function getBookmarkedScholarships(
  supabase: SupabaseServerClient,
  userId: string
): Promise<CardScholarship[]> {
  const [scholarshipIds, contestIds] = await Promise.all([
    getBookmarkedScholarshipIds(supabase, userId),
    getBookmarkedContestIds(supabase, userId),
  ]);

  const [scholarshipRowsResult, contestRowsResult] = await Promise.all([
    scholarshipIds.length > 0
      ? supabase
          .from("scholarships")
          .select(
            "id, name, organization, institution_type, support_types, support_amount_text, apply_end_date, poster_image_url, created_at, view_count, is_recommended, recommended_sort_order, is_advertisement"
          )
          .in("id", scholarshipIds)
      : Promise.resolve({ data: [] as const }),
    contestIds.length > 0
      ? supabase
          .from("contests")
          .select(
            "id, name, organization, organization_type, support_amount_text, apply_end_date, poster_image_url, created_at, view_count, is_recommended, recommended_sort_order, content_kind"
          )
          .in("id", contestIds)
      : Promise.resolve({ data: [] as const }),
  ]);

  const scholarshipMap = new Map(
    (scholarshipRowsResult.data ?? []).map((s) => [s.id, s])
  );
  const contestMap = new Map((contestRowsResult.data ?? []).map((c) => [c.id, c]));

  const scholarshipCards = scholarshipIds.flatMap((id) => {
    const s = scholarshipMap.get(id);
    if (!s) return [];
    if (isScholarshipExpired(s.apply_end_date)) return [];
    return [
      {
        id: s.id,
        name: s.name,
        organization: s.organization,
        institution_type: s.institution_type as string,
        support_types: s.support_types as string[],
        support_amount_text: s.support_amount_text,
        apply_end_date: s.apply_end_date,
        poster_image_url: s.poster_image_url ?? null,
        created_at: s.created_at,
        view_count: s.view_count,
        content_kind: "scholarship" as const,
        is_recommended: s.is_recommended,
        recommended_sort_order: s.recommended_sort_order,
        is_advertisement: s.is_advertisement,
      } satisfies CardScholarship,
    ];
  });

  const contestCards = contestIds.flatMap((id) => {
    const c = contestMap.get(id);
    if (!c) return [];
    const endDate = c.apply_end_date ?? "2099-12-31";
    if (isScholarshipExpired(endDate)) return [];
    return [
      {
        id: c.id,
        name: c.name,
        organization: c.organization,
        institution_type: c.organization_type || "기타",
        support_types: [] as string[],
        support_amount_text: c.support_amount_text,
        apply_end_date: endDate,
        poster_image_url: c.poster_image_url ?? null,
        created_at: c.created_at,
        view_count: c.view_count,
        content_kind: (c.content_kind ?? "contest") as
          | "contest"
          | "education"
          | "activity",
        is_recommended: c.is_recommended,
        recommended_sort_order: c.recommended_sort_order,
        is_advertisement: false,
      } satisfies CardScholarship,
    ];
  });

  // 장학금·공모전 각각 최신 담은 순 유지, 공모전을 앞에 두어 혼합 피드에서 보이기 쉽게
  return [...contestCards, ...scholarshipCards];
}
