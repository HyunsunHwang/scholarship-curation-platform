import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ScholarshipDashboard from "@/components/ScholarshipDashboard";
import { getHeroIllustrationPublicUrl } from "@/lib/hero-illustration-url";
import {
  createPublicSupabaseClient,
  getCachedHomeScholarships,
} from "@/lib/public-data";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const homeScholarships = await getCachedHomeScholarships();
  const publicSupabase = createPublicSupabaseClient();
  const heroIllustrationUrl = getHeroIllustrationPublicUrl(publicSupabase);

  const authSupabase = await createClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();

  let bookmarkedIds: number[] = [];
  if (user) {
    const { data: bookmarkRows } = await authSupabase
      .from("bookmarks")
      .select("scholarship_id")
      .eq("user_id", user.id);
    bookmarkedIds = (bookmarkRows ?? []).map((r) => r.scholarship_id);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar currentUser={user} />
      <main className="flex-1">
        <Hero heroIllustrationUrl={heroIllustrationUrl} />
        <ScholarshipDashboard
          scholarships={homeScholarships}
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
