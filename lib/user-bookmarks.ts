import { createClient } from "@/lib/supabase/server";
import type { CardScholarship } from "@/components/ScholarshipCard";
import { isScholarshipExpired } from "@/lib/scholarship-dates";
import { cardBookmarkKey } from "@/lib/bookmark-keys";
import { buildContestCardSupportFields, contestIdsNeedingNotice } from "@/lib/support-amount";
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
  const { keys } = await getHomeBookmarks(supabase, userId);
  return keys;
}

export type HomeBookmarkState = {
  /** 마감 제외된 북마크 카드 (최신 담은 순) */
  cards: CardScholarship[];
  /** 전체 북마크 키 (마감 포함 — 카드 initialBookmarked용) */
  keys: string[];
};

/**
 * 홈용 북마크를 한 번에 조회한다.
 * 카드·키를 각각 부르면 bookmarks 테이블을 두 번 치므로 합친다.
 */
export async function getHomeBookmarks(
  supabase: SupabaseServerClient,
  userId: string
): Promise<HomeBookmarkState> {
  const [scholarshipIds, contestIds] = await Promise.all([
    getBookmarkedScholarshipIds(supabase, userId),
    getBookmarkedContestIds(supabase, userId),
  ]);

  const keys = [
    ...scholarshipIds.map((id) =>
      cardBookmarkKey({ id, content_kind: "scholarship" })
    ),
    ...contestIds.map((id) => cardBookmarkKey({ id, content_kind: "contest" })),
  ];

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
            "id, name, organization, organization_type, support_amount_text, benefits, note, apply_end_date, poster_image_url, created_at, view_count, is_recommended, recommended_sort_order, content_kind"
          )
          .in("id", contestIds)
      : Promise.resolve({ data: [] as const }),
  ]);

  const scholarshipMap = new Map(
    (scholarshipRowsResult.data ?? []).map((s) => [s.id, s])
  );
  const contestRows = contestRowsResult.data ?? [];
  const noticeIds = contestIdsNeedingNotice(contestRows);
  const noticeById = new Map<number, string | null>();
  if (noticeIds.length > 0) {
    const { data: noticeRows } = await supabase
      .from("contests")
      .select("id, original_notice_text")
      .in("id", noticeIds);
    for (const row of noticeRows ?? []) {
      noticeById.set(row.id, row.original_notice_text);
    }
  }
  const contestMap = new Map(contestRows.map((c) => [c.id, c]));

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
    const kind = (c.content_kind ?? "contest") as
      | "contest"
      | "education"
      | "activity";
    const supportFields = buildContestCardSupportFields({
      name: c.name,
      contentKind: kind,
      supportAmountText: c.support_amount_text,
      benefits: c.benefits,
      additionalNote: c.note,
      originalNoticeText: noticeById.get(c.id) ?? null,
    });
    return [
      {
        id: c.id,
        name: c.name,
        organization: c.organization,
        institution_type: c.organization_type || "기타",
        support_types: [] as string[],
        support_amount_text: c.support_amount_text,
        benefits: c.benefits ?? null,
        benefit_note: c.note ?? null,
        benefit_notice_text: supportFields.benefit_notice_text,
        card_support_line: supportFields.card_support_line,
        apply_end_date: endDate,
        poster_image_url: c.poster_image_url ?? null,
        created_at: c.created_at,
        view_count: c.view_count,
        content_kind: kind,
        is_recommended: c.is_recommended,
        recommended_sort_order: c.recommended_sort_order,
        is_advertisement: false,
      } satisfies CardScholarship,
    ];
  });

  // 장학금·공모전 각각 최신 담은 순 유지, 공모전을 앞에 두어 혼합 피드에서 보이기 쉽게
  return {
    cards: [...contestCards, ...scholarshipCards],
    keys,
  };
}

/** 홈 라이브러리용 — 북마크 공고 카드 데이터 (최신 담은 순, 마감 제외) */
export async function getBookmarkedScholarships(
  supabase: SupabaseServerClient,
  userId: string
): Promise<CardScholarship[]> {
  const { cards } = await getHomeBookmarks(supabase, userId);
  return cards;
}
