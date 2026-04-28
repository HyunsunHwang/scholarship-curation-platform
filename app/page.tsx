import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ScholarshipDashboard from "@/components/ScholarshipDashboard";
import { getHeroIllustrationPublicUrl } from "@/lib/hero-illustration-url";
import { createClient } from "@/lib/supabase/server";
import { todayKoreaYYYYMMDD } from "@/lib/scholarship-dates";
import { isUniversitySpecificScholarship } from "@/lib/scholarship-university";

export default async function Home() {
  const supabase = await createClient();
  const today = todayKoreaYYYYMMDD();

  const [
    { data: scholarships },
    { data: universities },
    { data: { user } },
  ] = await Promise.all([
    supabase
      .from("scholarships")
      .select(
        "id, name, organization, institution_type, support_types, support_amount, support_amount_text, apply_end_date, poster_image_url, created_at, view_count"
      )
      .eq("is_verified", true)
      .eq("list_on_home", true)
      .gte("apply_end_date", today)
      .order("apply_end_date", { ascending: true }),
    supabase.from("universities").select("name"),
    supabase.auth.getUser(),
  ]);

  const universityNames = (universities ?? []).map((u) => u.name);
  const homeScholarships = (scholarships ?? []).filter(
    (s) => !isUniversitySpecificScholarship(s, universityNames)
  );
  const homeScholarshipIds = homeScholarships.map((s) => s.id);
  const { data: scrapRows } = homeScholarshipIds.length > 0
    ? await supabase
        .from("bookmarks")
        .select("scholarship_id")
        .in("scholarship_id", homeScholarshipIds)
    : { data: [] };
  const scrapCountByScholarship = new Map<number, number>();
  for (const row of scrapRows ?? []) {
    const id = row.scholarship_id as number;
    scrapCountByScholarship.set(id, (scrapCountByScholarship.get(id) ?? 0) + 1);
  }
  const homeScholarshipsWithStats = homeScholarships.map((s) => ({
    ...s,
    scrap_count: scrapCountByScholarship.get(s.id) ?? 0,
  }));

  let bookmarkedIds: number[] = [];
  if (user) {
    const { data: bookmarks } = await supabase
      .from("bookmarks")
      .select("scholarship_id")
      .eq("user_id", user.id);
    bookmarkedIds = (bookmarks ?? []).map((b) => b.scholarship_id as number);
  }

  const heroIllustrationUrl = getHeroIllustrationPublicUrl(supabase);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
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
