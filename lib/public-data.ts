import { unstable_cache } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { todayKoreaYYYYMMDD } from "@/lib/scholarship-dates";
import { isUniversitySpecificScholarship } from "@/lib/scholarship-university";

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

export const getCachedHomeScholarships = unstable_cache(
  async () => {
    const supabase = createPublicSupabaseClient();
    const today = todayKoreaYYYYMMDD();
    const [{ data: scholarships, error }, universityNames] = await Promise.all([
      supabase
        .from("scholarships")
        .select(
          "id, name, organization, qual_university, institution_type, support_types, support_amount, support_amount_text, apply_end_date, poster_image_url, created_at, view_count, is_recommended, recommended_sort_order"
        )
        .eq("is_verified", true)
        .eq("list_on_home", true)
        .gte("apply_end_date", today)
        .order("is_recommended", { ascending: false })
        .order("recommended_sort_order", { ascending: true, nullsFirst: false })
        .order("apply_end_date", { ascending: true }),
      getCachedUniversityNames(),
    ]);

    if (error) {
      console.error("Failed to load cached home scholarships", error);
      return [];
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
  ["home-scholarships"],
  { revalidate: 5 * 60 }
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
          support_amount: number;
          support_amount_text: string | null;
          apply_end_date: string;
          poster_image_url: string | null;
          created_at: string;
          view_count: number | null;
          is_recommended: boolean;
          recommended_sort_order: number | null;
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
        "id, name, organization, qual_university, institution_type, support_types, support_amount, support_amount_text, apply_end_date, poster_image_url, created_at, view_count, is_recommended, recommended_sort_order"
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
