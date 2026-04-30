import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import dynamic from "next/dynamic";
import Link from "next/link";
import { getHeroIllustrationPublicUrl } from "@/lib/hero-illustration-url";
import {
  createPublicSupabaseClient,
  getHomeScholarshipsPage,
} from "@/lib/public-data";
import { createClient } from "@/lib/supabase/server";

const ScholarshipDashboard = dynamic(
  () => import("@/components/ScholarshipDashboard"),
  {
    loading: () => (
      <section className="bg-[#fafafa] py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="aspect-2/3 animate-pulse rounded-2xl bg-gray-200"
              />
            ))}
          </div>
        </div>
      </section>
    ),
  }
);

const HOME_PAGE_SIZE = 24;

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const pageFromQuery = Number.parseInt(resolvedSearchParams.page ?? "1", 10);
  const currentPage =
    Number.isFinite(pageFromQuery) && pageFromQuery > 0 ? pageFromQuery : 1;
  const homeScholarshipsPage = await getHomeScholarshipsPage({
    page: currentPage,
    pageSize: HOME_PAGE_SIZE,
  });
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
          scholarships={homeScholarshipsPage.scholarships}
          bookmarkedIds={bookmarkedIds}
          totalScholarshipCount={homeScholarshipsPage.totalCount}
        />
        {homeScholarshipsPage.totalPages > 1 && (
          <div className="mx-auto flex w-full max-w-7xl items-center justify-center gap-2 px-4 pb-12 sm:px-6 lg:px-8">
            <Link
              href={`/?page=${Math.max(1, homeScholarshipsPage.page - 1)}`}
              aria-disabled={homeScholarshipsPage.page <= 1}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                homeScholarshipsPage.page <= 1
                  ? "pointer-events-none border-gray-200 text-gray-300"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              이전
            </Link>
            <span className="text-sm text-ink/60">
              {homeScholarshipsPage.page} / {homeScholarshipsPage.totalPages}
            </span>
            <Link
              href={`/?page=${homeScholarshipsPage.page + 1}`}
              aria-disabled={homeScholarshipsPage.page >= homeScholarshipsPage.totalPages}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                homeScholarshipsPage.page >= homeScholarshipsPage.totalPages
                  ? "pointer-events-none border-gray-200 text-gray-300"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              다음
            </Link>
          </div>
        )}
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
