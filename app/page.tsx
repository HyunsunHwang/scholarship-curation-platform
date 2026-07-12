import dynamic from "next/dynamic";
import SpotifyTopNav from "@/components/home/SpotifyTopNav";
import HomeSearchRoot from "@/components/home/HomeSearchRoot";
import type { CardScholarship } from "@/components/ScholarshipCard";
import { getCachedHomeScholarships, getCachedHomeContests } from "@/lib/public-data";
import { createClient } from "@/lib/supabase/server";
import { getBookmarkedScholarships } from "@/lib/user-bookmarks";
import { resolveNavUserContext } from "@/lib/nav-user-context";

const SpotifyHomeShell = dynamic(
  () => import("@/components/home/SpotifyHomeShell"),
  {
    loading: () => (
      <div className="mx-auto w-full max-w-[1760px] animate-pulse px-4 pb-10 pt-6 sm:px-6 lg:px-10">
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
          <div className="h-28 rounded-xl bg-gray-200" />
          <div className="h-28 rounded-xl bg-gray-200" />
        </div>
        <div className="flex gap-5">
          <div className="hidden h-72 w-[280px] shrink-0 rounded-2xl bg-gray-200 lg:block" />
          <div className="min-w-0 flex-1">
            <div className="mb-6 h-7 w-40 rounded bg-gray-200" />
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-40 shrink-0 space-y-2 sm:w-44">
                  <div className="aspect-2/3 rounded-xl bg-gray-200" />
                  <div className="h-4 w-full rounded bg-gray-200" />
                  <div className="h-3 w-2/3 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
  }
);

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ q }, homeScholarships, homeContests] = await Promise.all([
    searchParams,
    getCachedHomeScholarships(),
    getCachedHomeContests(),
  ]);
  const initialQuery = typeof q === "string" ? q : "";

  const homeFeedItems: CardScholarship[] = [
    ...homeContests,
    ...homeScholarships.map((s) => ({
      ...s,
      content_kind: "scholarship" as const,
    })),
  ];

  const authSupabase = await createClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();

  const navContextPromise = resolveNavUserContext(user);

  let bookmarkedIds: number[] = [];
  let bookmarkedScholarships: CardScholarship[] = [];

  if (user) {
    bookmarkedScholarships = await getBookmarkedScholarships(
      authSupabase,
      user.id
    );
    bookmarkedIds = bookmarkedScholarships.map((s) => s.id);
  }

  const navContext = await navContextPromise;

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <HomeSearchRoot initialQuery={initialQuery}>
        <SpotifyTopNav
          currentUser={user}
          currentUserRole={navContext.role}
          currentUserName={navContext.name}
          urgentBookmarkCount={navContext.urgentBookmarkCount}
        />
        <main className="flex-1">
          <SpotifyHomeShell
            scholarships={homeFeedItems}
            bookmarkedIds={bookmarkedIds}
            bookmarkedScholarships={bookmarkedScholarships}
            isLoggedIn={Boolean(user)}
          />
        </main>
      </HomeSearchRoot>
      <footer className="shrink-0 border-t border-gray-200/80 bg-white px-4 py-2.5 text-center text-xs text-ink/50">
        문의:{" "}
        <a
          href="mailto:hyunsun4819@gmail.com"
          className="font-medium text-brand hover:underline"
        >
          hyunsun4819@gmail.com
        </a>
      </footer>
    </div>
  );
}
