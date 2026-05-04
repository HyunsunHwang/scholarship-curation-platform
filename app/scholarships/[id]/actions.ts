"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const VIEW_DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const VIEW_COOKIE_KEY = "recent_viewed_scholarships";

export async function incrementScholarshipViewCount(scholarshipId: number) {
  if (!Number.isFinite(scholarshipId) || scholarshipId <= 0) return;
  const cookieStore = await cookies();
  const now = Date.now();
  const previous = cookieStore.get(VIEW_COOKIE_KEY)?.value;
  const viewedMap: Record<string, number> = (() => {
    if (!previous) return {};
    try {
      const parsed = JSON.parse(previous) as Record<string, number>;
      return Object.fromEntries(
        Object.entries(parsed).filter(([, timestamp]) => now - timestamp < VIEW_DEDUPE_WINDOW_MS)
      );
    } catch {
      return {};
    }
  })();
  const viewKey = String(scholarshipId);
  const lastViewedAt = viewedMap[viewKey];
  if (lastViewedAt && now - lastViewedAt < VIEW_DEDUPE_WINDOW_MS) {
    return { incremented: false as const, viewCount: null as number | null };
  }

  const supabase = await createClient();
  const { data: nextViewCount, error } = await supabase.rpc(
    "increment_scholarship_view_count",
    {
      p_scholarship_id: scholarshipId,
    }
  );
  if (error || typeof nextViewCount !== "number") {
    return { incremented: false as const, viewCount: null as number | null };
  }

  // 실제 DB 반영 성공 후에만 dedupe cookie를 기록해야 일시 실패에서 조회 누락이 생기지 않습니다.
  viewedMap[viewKey] = now;
  cookieStore.set(VIEW_COOKIE_KEY, JSON.stringify(viewedMap), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  return { incremented: true as const, viewCount: nextViewCount };
}

export async function getScholarshipLiveCounts(scholarshipId: number) {
  if (!Number.isFinite(scholarshipId) || scholarshipId <= 0) {
    return { viewCount: 0, scrapCount: 0 };
  }

  const supabase = await createClient();
  const [{ data: scholarship }, { data: scrapRows }] = await Promise.all([
    supabase.from("scholarships").select("view_count").eq("id", scholarshipId).maybeSingle(),
    supabase.rpc("get_scholarship_scrap_counts", {
      p_scholarship_ids: [scholarshipId],
    }),
  ]);

  const viewCount = scholarship?.view_count ?? 0;
  const scrapCount = Number(scrapRows?.[0]?.scrap_count ?? 0);
  return { viewCount, scrapCount };
}
