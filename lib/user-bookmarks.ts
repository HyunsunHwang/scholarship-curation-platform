import { createClient } from "@/lib/supabase/server";
import type { CardScholarship } from "@/components/ScholarshipCard";
import { isScholarshipExpired } from "@/lib/scholarship-dates";

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

/** 홈 라이브러리용 — 북마크 공고 카드 데이터 (최신 담은 순, 마감 제외) */
export async function getBookmarkedScholarships(
  supabase: SupabaseServerClient,
  userId: string
): Promise<CardScholarship[]> {
  const bookmarkedIds = await getBookmarkedScholarshipIds(supabase, userId);
  if (bookmarkedIds.length === 0) return [];

  const { data: scholarshipRows } = await supabase
    .from("scholarships")
    .select(
      "id, name, organization, institution_type, support_types, support_amount_text, apply_end_date, poster_image_url, created_at, view_count, is_recommended, recommended_sort_order, is_advertisement"
    )
    .in("id", bookmarkedIds);

  const scholarshipMap = new Map(
    (scholarshipRows ?? []).map((s) => [s.id, s])
  );

  return bookmarkedIds.flatMap((id) => {
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
      },
    ];
  });
}
