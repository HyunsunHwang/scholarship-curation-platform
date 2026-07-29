import type { User } from "@supabase/supabase-js";
import type { CardScholarship } from "@/components/ScholarshipCard";
import HomeDashboardHeroView from "@/components/home/HomeDashboardHeroView";
import { buildHomeDashboardStats } from "@/lib/home-dashboard-stats";
import { loadHomePersonalizationPrimary } from "@/lib/home-personalization";
import { createClient } from "@/lib/supabase/server";
import { isScholarshipExpired } from "@/lib/scholarship-dates";
import { cache } from "react";

const loadQualifiedCount = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_matched_scholarships", {
    p_user_id: userId,
  });
  const rows = (data ?? []) as { apply_end_date?: string }[];
  return rows.filter(
    (row) => row.apply_end_date && !isScholarshipExpired(row.apply_end_date)
  ).length;
});

export default async function HomeDashboardHero({
  catalog,
  user,
}: {
  catalog: CardScholarship[];
  user: User;
}) {
  const [primary, qualifiedCount] = await Promise.all([
    loadHomePersonalizationPrimary(user, catalog),
    loadQualifiedCount(user.id),
  ]);

  const stats = buildHomeDashboardStats({
    userName: primary.userName,
    catalog,
    savedCount: primary.bookmarkedKeys.length,
    recentCount: primary.serverRecent.length,
    urgentCount: primary.urgentBookmarks.length,
    qualifiedCount,
  });

  return <HomeDashboardHeroView stats={stats} />;
}
