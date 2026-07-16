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
import { clipNoticeForCard } from "@/lib/support-amount";
import { getForYouWeights } from "@/lib/home-ranking-weights";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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
    Boolean(options.recentViews?.length) ||
    Boolean(options.collaborativeKeys?.size);

  const ranked = hasSoftSignals
    ? softRankForYou(cards, {
        interests: options.interests,
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
      ? supabase.from("scholarships").select("*").in("id", schIds)
      : Promise.resolve({ data: [] as Database["public"]["Tables"]["scholarships"]["Row"][] }),
    contestIds.length > 0
      ? supabase
          .from("contests")
          .select(
            "id, name, organization, organization_type, support_amount_text, benefits, note, original_notice_text, apply_end_date, poster_image_url, created_at, view_count, is_recommended, recommended_sort_order, content_kind, interest_categories"
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

  const contestScoreMap = new Map(
    contestScores.map((r) => [r.contest_id, r.score])
  );
  const contestCards: CardScholarship[] = (contestRowsResult.data ?? [])
    .filter((c) => c.apply_end_date && !isScholarshipExpired(c.apply_end_date))
    .map((c) => ({
      id: c.id,
      name: c.name,
      organization: c.organization,
      institution_type: c.organization_type || "기타",
      support_types: [] as string[],
      support_amount_text: c.support_amount_text,
      benefits: c.benefits ?? null,
      benefit_note: c.note ?? null,
      benefit_notice_text: clipNoticeForCard(c.original_notice_text),
      apply_end_date: c.apply_end_date ?? "2099-12-31",
      poster_image_url: c.poster_image_url ?? null,
      created_at: c.created_at,
      view_count: c.view_count,
      content_kind: (c.content_kind ?? "contest") as
        | "contest"
        | "education"
        | "activity",
      is_recommended: c.is_recommended,
      recommended_sort_order: c.recommended_sort_order,
      interest_categories: c.interest_categories ?? null,
    }))
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
      .select("*")
      .eq("is_verified", true)
      .gte("apply_end_date", today)
      .contains("qual_university", [school])
      .limit(HOME_RAIL_ITEM_LIMIT);

    const existing = new Set(campusRows.map((r) => r.id));
    for (const row of byUniversity ?? []) {
      if (existing.has(row.id)) continue;
      campusRows.push(row);
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

  const rows = data as BrowseEventRow[];
  return rows
    .filter((row) => row.apply_end_date && !isScholarshipExpired(row.apply_end_date))
    .map(
      (row) =>
        ({
          id: row.content_id,
          name: row.name,
          organization: row.organization,
          institution_type: "기타",
          support_types: [],
          apply_end_date: row.apply_end_date ?? "2099-12-31",
          poster_image_url: row.poster_image_url,
          created_at: row.occurred_at,
          content_kind: row.content_kind,
        }) satisfies CardScholarship
    );
}
