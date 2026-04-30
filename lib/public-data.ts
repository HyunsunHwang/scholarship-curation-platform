import { unstable_cache } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { todayKoreaYYYYMMDD } from "@/lib/scholarship-dates";
import { isUniversitySpecificScholarship } from "@/lib/scholarship-university";

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
