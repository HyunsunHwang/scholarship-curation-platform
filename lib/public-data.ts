import { unstable_cache } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { todayKoreaYYYYMMDD } from "@/lib/scholarship-dates";
import { isUniversitySpecificScholarship } from "@/lib/scholarship-university";
import {
  buildContestCardSupportFields,
  contestIdsNeedingNotice,
} from "@/lib/support-amount";
import { effectiveContestScrapCount } from "@/lib/contest-scrap-counts";
type SiteSettingsLogoRow = Pick<
  Database["public"]["Tables"]["site_settings"]["Row"],
  "header_logo_url" | "updated_at"
>;

export function createPublicSupabaseClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

type PublicSupabaseClient = ReturnType<typeof createPublicSupabaseClient>;

type ScrapCountRow = {
  scholarship_id: number;
  scrap_count: number | string;
};

type ContestScrapCountRow = {
  contest_id: number;
  scrap_count: number | string;
};

async function getPublicScrapCountMap(
  supabase: PublicSupabaseClient,
  scholarshipIds: number[]
) {
  const uniqueIds = Array.from(new Set(scholarshipIds));
  const counts = new Map<number, number>();
  if (uniqueIds.length === 0) return counts;

  const { data, error } = await supabase.rpc("get_scholarship_scrap_counts", {
    p_scholarship_ids: uniqueIds,
  });

  if (error) {
    console.error("Failed to load public scholarship scrap counts", error);
    return counts;
  }

  for (const row of (data ?? []) as ScrapCountRow[]) {
    counts.set(row.scholarship_id, Number(row.scrap_count) || 0);
  }

  return counts;
}

async function getPublicContestScrapCountMap(
  supabase: PublicSupabaseClient,
  contestIds: number[]
) {
  const uniqueIds = Array.from(new Set(contestIds));
  const counts = new Map<number, number>();
  if (uniqueIds.length === 0) return counts;

  const { data, error } = await supabase.rpc("get_contest_scrap_counts", {
    p_contest_ids: uniqueIds,
  });

  if (error) {
    console.error("Failed to load public contest scrap counts", error);
    return counts;
  }

  for (const row of (data ?? []) as ContestScrapCountRow[]) {
    counts.set(row.contest_id, Number(row.scrap_count) || 0);
  }

  return counts;
}

export const getCachedUniversityNames = unstable_cache(
  async () => {
    const supabase = createPublicSupabaseClient();
    const { data, error } = await supabase
      .from("universities")
      .select("name")
      .order("name");

    if (error) {
      console.error("Failed to load cached university names", error);
      return [];
    }

    return (data ?? []).map((university) => university.name);
  },
  ["university-names"],
  { revalidate: 60 * 60 }
);

export const getCachedSiteSettings = unstable_cache(
  async () => {
    const supabase = createPublicSupabaseClient();
    const { data, error } = await supabase
      .from("site_settings")
      .select("header_logo_url, updated_at")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("Failed to load cached site settings", error);
      return null;
    }

    return data;
  },
  ["site-settings"],
  { revalidate: 5 * 60 }
);

/** 관리자 사이트 설정의 헤더 로고 URL (캐시 무효화 쿼리 포함). Navbar·인증·온보딩에서 동일하게 사용합니다. */
export function getHeaderLogoSrc(
  siteSettings: SiteSettingsLogoRow | null
): string | undefined {
  if (!siteSettings?.header_logo_url) return undefined;
  const base = siteSettings.header_logo_url;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}v=${encodeURIComponent(siteSettings.updated_at)}`;
}

/** 홈 피드 초기 로드 상한 — 선반당 노출(~12) + 여유 */
const HOME_SCHOLARSHIP_LIMIT = 24;
/** 공모전·교육·대외활동 종류별 홈 미리보기 */
const HOME_CONTEST_PER_KIND = 24;

export const getCachedHomeScholarships = unstable_cache(
  async () => {
    const supabase = createPublicSupabaseClient();
    const today = todayKoreaYYYYMMDD();
    const [{ data: scholarships, error }, universityNames] = await Promise.all([
      supabase
        .from("scholarships")
        .select(
          "id, name, organization, qual_university, qual_field_codes, qual_region, qual_school_location, institution_type, support_types, support_amount_text, apply_end_date, poster_image_url, created_at, view_count, is_recommended, recommended_sort_order, is_advertisement"
        )
        .eq("is_verified", true)
        .eq("list_on_home", true)
        .gte("apply_end_date", today)
        .order("is_recommended", { ascending: false })
        .order("recommended_sort_order", { ascending: true, nullsFirst: false })
        .order("apply_end_date", { ascending: true })
        // 홈 초기 페이로드 상한 — 전체 카탈로그를 클라이언트로 보내지 않음
        .limit(HOME_SCHOLARSHIP_LIMIT),
      getCachedUniversityNames(),
    ]);

    if (error) {
      console.error("Failed to load cached home scholarships", error);
      const fallbackPage = await getHomeScholarshipsPage({
        page: 1,
        pageSize: Math.min(50, HOME_SCHOLARSHIP_LIMIT),
      });
      return fallbackPage.scholarships.filter(
        (scholarship) => !isUniversitySpecificScholarship(scholarship, universityNames)
      );
    }

    const publicScholarships = (scholarships ?? []).filter((scholarship) =>
      !isUniversitySpecificScholarship(scholarship, universityNames)
    );
    const scrapCounts = await getPublicScrapCountMap(
      supabase,
      publicScholarships.map((scholarship) => scholarship.id)
    );

    return publicScholarships.map((scholarship) => ({
      ...scholarship,
      scrap_count: scrapCounts.get(scholarship.id) ?? 0,
    }));
  },
  ["home-scholarships-v5"],
  { revalidate: 5 * 60 }
);

export const getCachedHomeContests = unstable_cache(
  async () => {
    const supabase = createPublicSupabaseClient();
    const today = todayKoreaYYYYMMDD();
    const kinds = ["contest", "education", "activity"] as const;

    const kindResults = await Promise.all(
      kinds.map((kind) =>
        supabase
          .from("contests")
          .select(
            "id, name, organization, organization_type, support_amount_text, benefits, note, apply_end_date, poster_image_url, created_at, view_count, scrap_count, is_recommended, recommended_sort_order, content_kind, interest_categories"
          )
          .eq("is_verified", true)
          .eq("list_on_home", true)
          .eq("content_kind", kind)
          .gte("apply_end_date", today)
          .order("is_recommended", { ascending: false })
          .order("recommended_sort_order", { ascending: true, nullsFirst: false })
          .order("apply_end_date", { ascending: true })
          .limit(HOME_CONTEST_PER_KIND)
      )
    );

    for (const result of kindResults) {
      if (result.error) {
        console.error("Failed to load cached home contests", result.error);
        return [];
      }
    }

    const rows = kindResults.flatMap((result) => result.data ?? []);
    const noticeIds = contestIdsNeedingNotice(rows);
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

    const scrapCounts = await getPublicContestScrapCountMap(
      supabase,
      rows.map((contest) => contest.id)
    );

    return rows.map((contest) => {
      const kind = (contest.content_kind ?? "contest") as
        | "contest"
        | "education"
        | "activity";
      const supportFields = buildContestCardSupportFields({
        name: contest.name,
        contentKind: kind,
        supportAmountText: contest.support_amount_text,
        benefits: contest.benefits,
        additionalNote: contest.note,
        originalNoticeText: noticeById.get(contest.id) ?? null,
      });

      return {
        id: contest.id,
        name: contest.name,
        organization: contest.organization,
        institution_type: contest.organization_type || "기타",
        support_types: [] as string[],
        support_amount_text: contest.support_amount_text,
        benefits: contest.benefits ?? null,
        benefit_note: contest.note ?? null,
        benefit_notice_text: supportFields.benefit_notice_text,
        card_support_line: supportFields.card_support_line,
        apply_end_date: contest.apply_end_date ?? today,
        poster_image_url: contest.poster_image_url,
        created_at: contest.created_at,
        view_count: contest.view_count,
        scrap_count: effectiveContestScrapCount(
          contest.scrap_count,
          scrapCounts.get(contest.id) ?? 0
        ),
        is_recommended: contest.is_recommended,
        recommended_sort_order: contest.recommended_sort_order,
        is_advertisement: false,
        content_kind: kind,
        interest_categories: contest.interest_categories ?? null,
      };
    });
  },
  ["home-contests-v15"],
  { revalidate: 60 }
);

export async function getHomeScholarshipsPage({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}) {
  const supabase = createPublicSupabaseClient();
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(pageSize, 50));
  const { data, error } = await supabase.rpc("get_public_home_scholarships_page", {
    p_page: safePage,
    p_page_size: safePageSize,
  });

  if (error) {
    console.error("Failed to load paginated home scholarships", error);
    return getHomeScholarshipsPageFallback({
      supabase,
      page: safePage,
      pageSize: safePageSize,
    });
  }
  const payload = data as
    | {
        page?: number;
        page_size?: number;
        total_count?: number;
        rows?: Array<{
          id: number;
          name: string;
          organization: string;
          qual_university: string[] | null;
          institution_type: string;
          support_types: string[];
          support_amount_text: string | null;
          apply_end_date: string;
          poster_image_url: string | null;
          created_at: string;
          view_count: number | null;
          is_recommended: boolean;
          recommended_sort_order: number | null;
          is_advertisement: boolean;
          scrap_count: number | null;
        }>;
      }
    | null;
  const totalCount = payload?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const mappedScholarships = (payload?.rows ?? []).map((row) => ({
    ...row,
    scrap_count: row.scrap_count ?? 0,
  }));

  return {
    scholarships: mappedScholarships,
    page: payload?.page ?? safePage,
    pageSize: safePageSize,
    totalCount,
    totalPages,
  };
}

async function getHomeScholarshipsPageFallback({
  supabase,
  page,
  pageSize,
}: {
  supabase: PublicSupabaseClient;
  page: number;
  pageSize: number;
}) {
  const today = todayKoreaYYYYMMDD();
  const serverPageSize = pageSize * 3;
  const maxRowsToScan = page * serverPageSize;

  const [{ data: scholarships, error }, universityNames] = await Promise.all([
    supabase
      .from("scholarships")
      .select(
        "id, name, organization, qual_university, institution_type, support_types, support_amount_text, apply_end_date, poster_image_url, created_at, view_count, is_recommended, recommended_sort_order, is_advertisement"
      )
      .eq("is_verified", true)
      .eq("list_on_home", true)
      .gte("apply_end_date", today)
      .order("is_recommended", { ascending: false })
      .order("recommended_sort_order", { ascending: true, nullsFirst: false })
      .order("apply_end_date", { ascending: true })
      .limit(maxRowsToScan),
    getCachedUniversityNames(),
  ]);

  if (error) {
    console.error("Fallback home scholarships query failed", error);
    return {
      scholarships: [],
      page,
      pageSize,
      totalCount: 0,
      totalPages: 1,
    };
  }

  const filteredPublicScholarships = (scholarships ?? []).filter((scholarship) =>
    !isUniversitySpecificScholarship(scholarship, universityNames)
  );
  const totalCount = filteredPublicScholarships.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = (page - 1) * pageSize;
  const to = from + pageSize;
  const publicScholarships = filteredPublicScholarships.slice(from, to);
  const scrapCounts = await getPublicScrapCountMap(
    supabase,
    publicScholarships.map((scholarship) => scholarship.id)
  );
  const mappedScholarships = publicScholarships.map((scholarship) => ({
    ...scholarship,
    scrap_count: scrapCounts.get(scholarship.id) ?? 0,
  }));

  return {
    scholarships: mappedScholarships,
    page,
    pageSize,
    totalCount,
    totalPages,
  };
}
