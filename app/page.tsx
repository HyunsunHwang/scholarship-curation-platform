import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ScholarshipDashboard from "@/components/ScholarshipDashboard";
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
        "id, name, organization, institution_type, support_types, support_amount, apply_end_date, poster_image_url, created_at"
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

  let bookmarkedIds: number[] = [];
  if (user) {
    const { data: bookmarks } = await supabase
      .from("bookmarks")
      .select("scholarship_id")
      .eq("user_id", user.id);
    bookmarkedIds = (bookmarks ?? []).map((b) => b.scholarship_id as number);
  }

  // Hero 통계 계산 (전액 장학금은 700만원으로 추산)
  const list = homeScholarships;
  const totalAmountMan = list.reduce((sum, s) => {
    const man = s.support_amount / 10000;
    return sum + (man === 0 ? 700 : man);
  }, 0);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero
          scholarshipCount={list.length}
          totalAmountMan={Math.round(totalAmountMan)}
          isLoggedIn={!!user}
        />
        <ScholarshipDashboard
          scholarships={homeScholarships}
          bookmarkedIds={bookmarkedIds}
        />
      </main>
      <footer className="border-t border-[#e8d9c8] bg-[#fff2df] py-8">
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
