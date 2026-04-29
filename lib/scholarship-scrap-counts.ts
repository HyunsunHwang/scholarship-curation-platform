import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ScrapCountRow = {
  scholarship_id: number;
  scrap_count: number | string;
};

function toCountMap(rows: ScrapCountRow[] | null | undefined) {
  const counts = new Map<number, number>();

  for (const row of rows ?? []) {
    counts.set(row.scholarship_id, Number(row.scrap_count) || 0);
  }

  return counts;
}

async function fallbackScrapCounts(
  supabase: SupabaseServerClient,
  scholarshipIds: number[]
) {
  const { data } = await supabase
    .from("bookmarks")
    .select("scholarship_id")
    .in("scholarship_id", scholarshipIds);

  const counts = new Map<number, number>();
  for (const row of data ?? []) {
    const id = row.scholarship_id as number;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return counts;
}

export async function getScholarshipScrapCounts(
  supabase: SupabaseServerClient,
  scholarshipIds: number[]
) {
  const uniqueIds = Array.from(new Set(scholarshipIds));
  if (uniqueIds.length === 0) return new Map<number, number>();

  const { data, error } = await supabase.rpc("get_scholarship_scrap_counts", {
    p_scholarship_ids: uniqueIds,
  });

  if (error) {
    console.error("Falling back to client-side scrap count aggregation", error);
    return fallbackScrapCounts(supabase, uniqueIds);
  }

  return toCountMap(data);
}
