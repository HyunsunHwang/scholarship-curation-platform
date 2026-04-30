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
  if (lastViewedAt && now - lastViewedAt < VIEW_DEDUPE_WINDOW_MS) return;
  viewedMap[viewKey] = now;
  cookieStore.set(VIEW_COOKIE_KEY, JSON.stringify(viewedMap), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  const supabase = await createClient();
  const { data } = await supabase
    .from("scholarships")
    .select("view_count")
    .eq("id", scholarshipId)
    .maybeSingle();
  if (!data) return;
  const nextViewCount = (data.view_count ?? 0) + 1;
  await supabase
    .from("scholarships")
    .update({ view_count: nextViewCount })
    .eq("id", scholarshipId);
}
