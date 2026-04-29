import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ScholarshipDashboard from "@/components/ScholarshipDashboard";
import { getHeroIllustrationPublicUrl } from "@/lib/hero-illustration-url";
import { createClient } from "@/lib/supabase/server";
import { todayKoreaYYYYMMDD } from "@/lib/scholarship-dates";
import { isUniversitySpecificScholarship } from "@/lib/scholarship-university";
import { getCachedUniversityNames } from "@/lib/public-data";
import { getScholarshipScrapCounts } from "@/lib/scholarship-scrap-counts";

export default async function Home() {
  const supabase = await createClient();
  const today = todayKoreaYYYYMMDD();

  const [
    { data: scholarships },
    universityNames,
    { data: { user } },
  ] = await Promise.all([
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
    supabase.auth.getUser(),
  ]);

  const homeScholarships = (scholarships ?? []).filter(
    (s) => !isUniversitySpecificScholarship(s, universityNames)
  );
  const homeScholarshipIds = homeScholarships.map((s) => s.id);
  const [scrapCountByScholarship, bookmarksResult] = await Promise.all([
    getScholarshipScrapCounts(supabase, homeScholarshipIds),
    user
      ? supabase
          .from("bookmarks")
          .select("scholarship_id")
          .eq("user_id", user.id)
      : Promise.resolve({ data: [] }),
  ]);
  const homeScholarshipsWithStats = homeScholarships.map((s) => ({
    ...s,
    scrap_count: scrapCountByScholarship.get(s.id) ?? 0,
  }));

  const bookmarkedIds = (bookmarksResult.data ?? []).map(
    (b) => b.scholarship_id as number
  );

  const heroIllustrationUrl = getHeroIllustrationPublicUrl(supabase);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar currentUser={user} />
      <main className="flex-1">
        <Hero heroIllustrationUrl={heroIllustrationUrl} isLoggedIn={!!user} />
        <ScholarshipDashboard
          scholarships={homeScholarshipsWithStats}
          bookmarkedIds={bookmarkedIds}
        />
      </main>
      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-brand">
                <span className="text-xs font-bold text-white">K</span>
              </div>
              <span className="text-sm font-semibold text-ink">
                쿠넥트
              </span>
            </div>
            <p className="text-xs text-ink/40">
              © 2026 쿠넥트. 장학금 정보는 각 기관의 공식 발표를 기준으로 합니다.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
