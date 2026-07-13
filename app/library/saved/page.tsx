import Link from "next/link";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import HomeSearchRoot from "@/components/home/HomeSearchRoot";
import SpotifyTopNav from "@/components/home/SpotifyTopNav";
import ScholarshipDashboard from "@/components/ScholarshipDashboard";
import type { CardScholarship } from "@/components/ScholarshipCard";
import { createClient } from "@/lib/supabase/server";
import { getBookmarkedScholarships } from "@/lib/user-bookmarks";
import { getScholarshipScrapCounts } from "@/lib/scholarship-scrap-counts";
import { resolveNavUserContext } from "@/lib/nav-user-context";

const BookmarkedScholarshipCalendar = dynamic(
  () => import("@/components/BookmarkedScholarshipCalendar"),
  {
    loading: () => (
      <div className="mx-auto mt-8 h-64 w-full max-w-7xl animate-pulse rounded-3xl bg-gray-100" />
    ),
  }
);

export default async function LibrarySavedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const [navContext, savedItemsRaw] = await Promise.all([
    resolveNavUserContext(user),
    getBookmarkedScholarships(supabase, user.id),
  ]);

  // 장학금 항목에는 스크랩 수를 붙여 '스크랩순' 정렬이 동작하게 한다
  const scholarshipIds = savedItemsRaw
    .filter((item) => (item.content_kind ?? "scholarship") === "scholarship")
    .map((item) => item.id);
  const scrapCountByScholarship = await getScholarshipScrapCounts(
    supabase,
    scholarshipIds
  );
  const savedItems: CardScholarship[] = savedItemsRaw.map((item) =>
    (item.content_kind ?? "scholarship") === "scholarship"
      ? { ...item, scrap_count: scrapCountByScholarship.get(item.id) ?? 0 }
      : item
  );

  // 이 페이지의 모든 항목은 북마크 상태
  const bookmarkedIds = savedItems.map((item) => item.id);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <HomeSearchRoot>
        <SpotifyTopNav
          variant="compact"
          currentUser={user}
          currentUserRole={navContext.role}
          currentUserName={navContext.name}
          urgentBookmarkCount={navContext.urgentBookmarkCount}
        />
      </HomeSearchRoot>
      <main className="flex-1 bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 lg:px-10">
          <Link
            href="/library"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink/55 transition-colors hover:text-ink"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            내 라이브러리
          </Link>
          <div className="mt-4 flex items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              담은 공고
            </h1>
            {savedItems.length > 0 ? (
              <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">
                {savedItems.length}개
              </span>
            ) : null}
          </div>
        </div>

        {savedItems.length === 0 ? (
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-24 text-center sm:px-6 lg:px-10">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="h-10 w-10 text-peach"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
                />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold text-ink">
                아직 담은 공고가 없어요
              </p>
              <p className="mt-1 text-sm text-ink/60">
                관심 있는 공고에 스크랩을 추가해보세요.
              </p>
            </div>
            <Link
              href="/browse"
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/85"
            >
              탐색하러 가기
            </Link>
          </div>
        ) : (
          <div>
            <BookmarkedScholarshipCalendar scholarships={savedItems} />
            <ScholarshipDashboard
              scholarships={savedItems}
              bookmarkedIds={bookmarkedIds}
              heading="담은 공고"
            />
          </div>
        )}
      </main>
    </div>
  );
}
