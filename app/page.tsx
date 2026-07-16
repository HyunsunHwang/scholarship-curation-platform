import dynamic from "next/dynamic";
import SpotifyTopNav from "@/components/home/SpotifyTopNav";
import HomeSearchRoot from "@/components/home/HomeSearchRoot";
import type { CardScholarship } from "@/components/ScholarshipCard";
import type { HomeRail } from "@/lib/home-rails";
import { getCachedHomeScholarships, getCachedHomeContests } from "@/lib/public-data";
import { createClient } from "@/lib/supabase/server";
import { getBookmarkedScholarships, getBookmarkedCardKeys } from "@/lib/user-bookmarks";
import { resolveNavUserContext } from "@/lib/nav-user-context";
import { filterUrgentBookmarks } from "@/lib/home-rails";
import { assemblePersonalizedRails } from "@/lib/home-rails-assemble";
import {
  fetchCollaborativeCards,
  fetchHomeCampusScholarships,
  fetchHomeMatchedScholarships,
  fetchRecentBrowseCards,
} from "@/lib/home-rails-server";

const SpotifyHomeShell = dynamic(
  () => import("@/components/home/SpotifyHomeShell"),
  {
    loading: () => (
      <div className="w-full animate-pulse px-4 pb-10 pt-6 sm:px-6 lg:px-10">
        <div className="mb-6 h-56 w-full rounded-3xl bg-gray-200" />
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

  let bookmarkedKeys: string[] = [];
  let urgentSource: CardScholarship[] = [];
  let forYou: CardScholarship[] = [];
  let serverRecent: CardScholarship[] = [];
  let interestRails: HomeRail[] = [];
  let campusRail: HomeRail | null = null;
  let regionRail: HomeRail | null = null;
  let collaborativeRail: HomeRail | null = null;
  let isOnboarded = false;
  let userName: string | null = null;

  if (user) {
    const [bookmarks, keys, profileResult, recent, cfResult] = await Promise.all([
      getBookmarkedScholarships(authSupabase, user.id),
      getBookmarkedCardKeys(authSupabase, user.id),
      authSupabase
        .from("profiles")
        .select(
          "is_onboarded, name, interest_categories, school_name, school_location, address"
        )
        .eq("id", user.id)
        .single(),
      fetchRecentBrowseCards(authSupabase),
      fetchCollaborativeCards(authSupabase),
    ]);

    urgentSource = bookmarks;
    bookmarkedKeys = keys;
    serverRecent = recent;
    isOnboarded = Boolean(profileResult.data?.is_onboarded);
    userName = profileResult.data?.name ?? null;

    const interests = profileResult.data?.interest_categories ?? null;
    const profileSignals = {
      schoolName: profileResult.data?.school_name,
      schoolLocation: profileResult.data?.school_location,
      address: profileResult.data?.address,
    };

    if (isOnboarded) {
      const [matched, campusItems] = await Promise.all([
        fetchHomeMatchedScholarships(authSupabase, user.id, {
          interests,
          recentViews: serverRecent,
          collaborativeKeys: cfResult.keys,
        }),
        fetchHomeCampusScholarships(
          authSupabase,
          user.id,
          profileSignals.schoolName
        ),
      ]);
      forYou = matched;

      const assembled = assemblePersonalizedRails({
        catalog: homeFeedItems,
        forYou,
        interests,
        profile: profileSignals,
        campusItems,
        collaborativeItems: cfResult.items,
      });
      interestRails = assembled.interestRails;
      campusRail = assembled.campusRail;
      regionRail = assembled.regionRail;
      collaborativeRail = assembled.collaborativeRail;
    } else if (interests?.length) {
      interestRails = assemblePersonalizedRails({
        catalog: homeFeedItems,
        forYou: [],
        interests,
        profile: profileSignals,
        campusItems: [],
        collaborativeItems: cfResult.items,
      }).interestRails;
    }
  }

  const urgentBookmarks = filterUrgentBookmarks(urgentSource);
  const navContext = await navContextPromise;
  if (!userName && navContext.name) userName = navContext.name;

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
            bookmarkedKeys={bookmarkedKeys}
            forYou={forYou}
            urgentBookmarks={urgentBookmarks}
            serverRecent={serverRecent}
            interestRails={interestRails}
            campusRail={campusRail}
            regionRail={regionRail}
            collaborativeRail={collaborativeRail}
            userName={userName}
            isLoggedIn={Boolean(user)}
            isOnboarded={isOnboarded}
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
