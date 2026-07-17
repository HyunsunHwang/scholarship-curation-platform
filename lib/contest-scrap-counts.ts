import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ScrapCountRow = {
  contest_id: number;
  scrap_count: number | string;
};

function toCountMap(rows: ScrapCountRow[] | null | undefined) {
  const counts = new Map<number, number>();
  for (const row of rows ?? []) {
    counts.set(row.contest_id, Number(row.scrap_count) || 0);
  }
  return counts;
}

/** Ranking scrap = max(Linkareer/stored scrap_count, platform bookmarks) */
export function effectiveContestScrapCount(
  storedScrapCount: number | null | undefined,
  bookmarkScrapCount: number
): number {
  return Math.max(Number(storedScrapCount) || 0, Number(bookmarkScrapCount) || 0);
}

async function fallbackScrapCounts(
  supabase: SupabaseServerClient,
  contestIds: number[]
) {
  const { data } = await supabase
    .from("contest_bookmarks")
    .select("contest_id")
    .in("contest_id", contestIds);

  const counts = new Map<number, number>();
  for (const row of data ?? []) {
    const id = row.contest_id as number;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export async function getContestScrapCounts(
  supabase: SupabaseServerClient,
  contestIds: number[]
) {
  const uniqueIds = Array.from(new Set(contestIds));
  if (uniqueIds.length === 0) return new Map<number, number>();

  const { data, error } = await supabase.rpc("get_contest_scrap_counts", {
    p_contest_ids: uniqueIds,
  });

  if (error) {
    console.error("Falling back to client-side contest scrap count aggregation", error);
    return fallbackScrapCounts(supabase, uniqueIds);
  }

  return toCountMap(data);
}
