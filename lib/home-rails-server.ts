import type { CardScholarship } from "@/components/ScholarshipCard";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  isScholarshipExpired,
  todayKoreaYYYYMMDD,
} from "@/lib/scholarship-dates";
import { getScholarshipScrapCounts } from "@/lib/scholarship-scrap-counts";
import { isUniversitySpecificScholarship } from "@/lib/scholarship-university";
import { getCachedUniversityNames } from "@/lib/public-data";
import {
  HOME_FOR_YOU_LIMIT,
  HOME_RAIL_ITEM_LIMIT,
  cardItemKey,
  rankForYou,
  softRankForYou,
} from "@/lib/home-rails";
import { getForYouWeights } from "@/lib/home-ranking-weights";
import {
  buildContestCardSupportFields,
  contestIdsNeedingNotice,
} from "@/lib/support-amount";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** 홈 레일/교내 카드용 — select("*") 대신 필요한 컬럼만 */
const HOME_SCHOLARSHIP_CARD_SELECT =
  "id, name, organization, institution_type, support_types, support_amount_text, apply_end_date, poster_image_url, created_at, view_count, is_recommended, recommended_sort_order, is_advertisement, qual_field_codes, qual_university, qual_region, qual_school_location";

function mapScholarshipRows(
  rows: Database["public"]["Tables"]["scholarships"]["Row"][],
  scrapCountByScholarship: Map<number, number>,
  universityNames: readonly string[]
): CardScholarship[] {
  return rows
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
      scrap_count: scrapCountByScholarship.get(s.id) ?? 0,
      scope: isUniversitySpecificScholarship(s, universityNames)
        ? ("campus" as const)
        : ("external" as const),
      is_recommended: s.is_recommended,
      recommended_sort_order: s.recommended_sort_order,
      is_advertisement: s.is_advertisement,
      content_kind: "scholarship" as const,
      qual_field_codes: s.qual_field_codes ?? null,
      qual_university: s.qual_university ?? null,
      qual_region: s.qual_region ?? null,
      qual_school_location: s.qual_school_location ?? null,
    }));
}

export async function fetchHomeMatchedScholarships(
  supabase: SupabaseServerClient,
  userId: string,
  options: {
    interests?: readonly string[] | null;
    savedItems?: CardScholarship[];
    recentViews?: CardScholarship[];
    collaborativeKeys?: ReadonlySet<string>;
  } = {}
): Promise<CardScholarship[]> {
  const [{ data: matched, error }, universityNames] = await Promise.all([
    supabase.rpc("get_matched_scholarships", { p_user_id: userId }),
    getCachedUniversityNames(),
  ]);

  if (error || !matched) return [];

  const rows = matched as Database["public"]["Tables"]["scholarships"]["Row"][];
  const active = rows.filter((s) => !isScholarshipExpired(s.apply_end_date));
  const scrapCountByScholarship = await getScholarshipScrapCounts(
    supabase,
    active.map((s) => s.id)
  );

  const cards = mapScholarshipRows(
    active,
    scrapCountByScholarship,
    universityNames
  );

  const hasSoftSignals =
    Boolean(options.interests?.length) ||
    Boolean(options.savedItems?.length) ||
    Boolean(options.recentViews?.length) ||
    Boolean(options.collaborativeKeys?.size);

  const ranked = hasSoftSignals
    ? softRankForYou(cards, {
        interests: options.interests,
        savedItems: options.savedItems,
        recentViews: options.recentViews,
        collaborativeKeys: options.collaborativeKeys,
        weights: getForYouWeights(),
      })
    : rankForYou(cards);

  return ranked.slice(0, HOME_FOR_YOU_LIMIT);
}

type CfScholarshipRow = {
  scholarship_id: number;
  score: number;
  source: string;
};

type CfContestRow = {
  contest_id: number;
  score: number;
  source: string;
};

/** item-item CF + 학교 코호트 폴백 */
export async function fetchCollaborativeCards(
  supabase: SupabaseServerClient,
  limit = HOME_RAIL_ITEM_LIMIT
): Promise<{ items: CardScholarship[]; keys: Set<string> }> {
  const [schResult, contestResult, universityNames] = await Promise.all([
    supabase.rpc("get_collaborative_scholarship_ids", { p_limit: limit }),
    supabase.rpc("get_collaborative_contest_ids", { p_limit: Math.ceil(limit / 2) }),
    getCachedUniversityNames(),
  ]);

  if (schResult.error) {
    console.error("CF scholarship RPC failed", schResult.error);
  }
  if (contestResult.error) {
    console.error("CF contest RPC failed", contestResult.error);
  }

  const schScores = (schResult.data ?? []) as CfScholarshipRow[];
  const contestScores = (contestResult.data ?? []) as CfContestRow[];

  const schIds = schScores.map((r) => r.scholarship_id);
  const contestIds = contestScores.map((r) => r.contest_id);

  const [schRowsResult, contestRowsResult, scrapCounts] = await Promise.all([
    schIds.length > 0
      ? supabase
          .from("scholarships")
          .select(HOME_SCHOLARSHIP_CARD_SELECT)
          .in("id", schIds)
      : Promise.resolve({ data: [] as Database["public"]["Tables"]["scholarships"]["Row"][] }),
    contestIds.length > 0
      ? supabase
          .from("contests")
          .select(
            "id, name, organization, organization_type, support_amount_text, benefits, note, apply_end_date, poster_image_url, created_at, view_count, is_recommended, recommended_sort_order, content_kind, interest_categories"
          )
          .in("id", contestIds)
      : Promise.resolve({ data: [] as const }),
    getScholarshipScrapCounts(supabase, schIds),
  ]);

  const schCards = mapScholarshipRows(
    (schRowsResult.data ?? []) as Database["public"]["Tables"]["scholarships"]["Row"][],
    scrapCounts,
    universityNames
  );
  const schScoreMap = new Map(
    schScores.map((r) => [r.scholarship_id, r.score])
  );
  schCards.sort(
    (a, b) => (schScoreMap.get(b.id) ?? 0) - (schScoreMap.get(a.id) ?? 0)
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

  const contestScoreMap = new Map(
    contestScores.map((r) => [r.contest_id, r.score])
  );
  const contestCards: CardScholarship[] = contestRows
    .filter((c) => c.apply_end_date && !isScholarshipExpired(c.apply_end_date))
    .map((c) => {
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
      return {
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
        apply_end_date: c.apply_end_date ?? "2099-12-31",
        poster_image_url: c.poster_image_url ?? null,
        created_at: c.created_at,
        view_count: c.view_count,
        content_kind: kind,
        is_recommended: c.is_recommended,
        recommended_sort_order: c.recommended_sort_order,
        interest_categories: c.interest_categories ?? null,
      };
    })
    .sort(
      (a, b) => (contestScoreMap.get(b.id) ?? 0) - (contestScoreMap.get(a.id) ?? 0)
    );

  // 장학금 CF를 앞에, 공모전 CF를 뒤에 섞되 상한 유지
  const merged = [...schCards, ...contestCards].slice(0, limit);
  return {
    items: merged,
    keys: new Set(merged.map(cardItemKey)),
  };
}

/** 교내 전용 공고 — matched에서 campus + 대학명 직접 조회 보강 */
export async function fetchHomeCampusScholarships(
  supabase: SupabaseServerClient,
  userId: string,
  schoolName: string | null | undefined
): Promise<CardScholarship[]> {
  const universityNames = await getCachedUniversityNames();
  const today = todayKoreaYYYYMMDD();

  const { data: matched } = await supabase.rpc("get_matched_scholarships", {
    p_user_id: userId,
  });

  const matchedRows = (
    (matched ?? []) as Database["public"]["Tables"]["scholarships"]["Row"][]
  ).filter((s) => !isScholarshipExpired(s.apply_end_date));

  let campusRows = matchedRows.filter((s) =>
    isUniversitySpecificScholarship(s, universityNames)
  );

  const school = schoolName?.trim();
  if (school && campusRows.length < HOME_RAIL_ITEM_LIMIT) {
    const { data: byUniversity } = await supabase
      .from("scholarships")
      .select(HOME_SCHOLARSHIP_CARD_SELECT)
      .eq("is_verified", true)
      .gte("apply_end_date", today)
      .contains("qual_university", [school])
      .limit(HOME_RAIL_ITEM_LIMIT);

    const existing = new Set(campusRows.map((r) => r.id));
    for (const row of byUniversity ?? []) {
      if (existing.has(row.id)) continue;
      campusRows.push(
        row as Database["public"]["Tables"]["scholarships"]["Row"]
      );
      existing.add(row.id);
    }
  }

  campusRows = campusRows.slice(0, HOME_RAIL_ITEM_LIMIT * 2);
  const scrapCountByScholarship = await getScholarshipScrapCounts(
    supabase,
    campusRows.map((s) => s.id)
  );

  return mapScholarshipRows(
    campusRows,
    scrapCountByScholarship,
    universityNames
  ).filter((s) => s.scope === "campus");
}

type BrowseEventRow = {
  content_kind: "scholarship" | "contest" | "education" | "activity";
  content_id: number;
  name: string;
  organization: string;
  poster_image_url: string | null;
  apply_end_date: string | null;
  occurred_at: string;
};

const RECENT_CONTEST_CARD_SELECT =
  "id, name, organization, organization_type, support_amount_text, benefits, note, apply_end_date, poster_image_url, created_at, view_count, is_recommended, recommended_sort_order, content_kind, interest_categories";

export async function fetchRecentBrowseCards(
  supabase: SupabaseServerClient,
  limit = 24
): Promise<CardScholarship[]> {
  const { data, error } = await supabase.rpc("get_recent_browse_events", {
    p_limit: limit,
  });

  if (error || !data) {
    if (error) console.error("Failed to load browse events", error);
    return [];
  }

  const rows = (data as BrowseEventRow[]).filter(
    (row) => row.apply_end_date && !isScholarshipExpired(row.apply_end_date)
  );
  if (rows.length === 0) return [];

  const schIds = rows
    .filter((row) => row.content_kind === "scholarship")
    .map((row) => row.content_id);
  const contestIds = rows
    .filter((row) => row.content_kind !== "scholarship")
    .map((row) => row.content_id);

  const [schResult, contestResult] = await Promise.all([
    schIds.length > 0
      ? supabase
          .from("scholarships")
          .select(HOME_SCHOLARSHIP_CARD_SELECT)
          .in("id", schIds)
      : Promise.resolve({ data: [] as const }),
    contestIds.length > 0
      ? supabase
          .from("contests")
          .select(RECENT_CONTEST_CARD_SELECT)
          .in("id", contestIds)
      : Promise.resolve({ data: [] as const }),
  ]);

  const contestRows = contestResult.data ?? [];
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

  const schById = new Map<number, CardScholarship>(
    (schResult.data ?? []).map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        organization: row.organization,
        institution_type: row.institution_type as string,
        support_types: (row.support_types as string[]) ?? [],
        support_amount_text: row.support_amount_text,
        apply_end_date: row.apply_end_date,
        poster_image_url: row.poster_image_url ?? null,
        created_at: row.created_at,
        view_count: row.view_count,
        content_kind: "scholarship" as const,
        is_recommended: row.is_recommended,
        recommended_sort_order: row.recommended_sort_order,
        is_advertisement: row.is_advertisement,
        qual_field_codes: row.qual_field_codes ?? null,
        qual_university: row.qual_university ?? null,
        qual_region: row.qual_region ?? null,
        qual_school_location: row.qual_school_location ?? null,
      },
    ])
  );

  const contestById = new Map<number, CardScholarship>(
    contestRows.map((c) => {
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
        c.id,
        {
          id: c.id,
          name: c.name,
          organization: c.organization,
          institution_type: c.organization_type || "기타",
          support_types: [],
          support_amount_text: c.support_amount_text,
          benefits: c.benefits ?? null,
          benefit_note: c.note ?? null,
          benefit_notice_text: supportFields.benefit_notice_text,
          card_support_line: supportFields.card_support_line,
          apply_end_date: c.apply_end_date ?? "2099-12-31",
          poster_image_url: c.poster_image_url ?? null,
          created_at: c.created_at,
          view_count: c.view_count,
          content_kind: kind,
          is_recommended: c.is_recommended,
          recommended_sort_order: c.recommended_sort_order,
          interest_categories: c.interest_categories ?? null,
        },
      ];
    })
  );

  const out: CardScholarship[] = [];
  for (const row of rows) {
    const hit =
      row.content_kind === "scholarship"
        ? schById.get(row.content_id)
        : contestById.get(row.content_id);
    if (hit) out.push(hit);
  }
  return out;
}
