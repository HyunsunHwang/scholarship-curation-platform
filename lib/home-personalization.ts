import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import type { CardScholarship } from "@/components/ScholarshipCard";
import type { HomeRail } from "@/lib/home-rails";
import { buildForYouCurated, filterUrgentBookmarks } from "@/lib/home-rails";
import { assemblePersonalizedRails } from "@/lib/home-rails-assemble";
import {
  fetchCollaborativeCards,
  fetchHomeCampusScholarships,
  fetchRecentBrowseCards,
} from "@/lib/home-rails-server";
import { getCachedHomeProfileBundle } from "@/lib/home-profile-bundle";
import { createClient } from "@/lib/supabase/server";
import { getHomeBookmarks } from "@/lib/user-bookmarks";

export type HomePersonalizationPrimary = {
  bookmarkedKeys: string[];
  urgentBookmarks: CardScholarship[];
  forYou: CardScholarship[];
  serverRecent: CardScholarship[];
  userName: string | null;
  isOnboarded: boolean;
};

export type HomePersonalizationRails = {
  interestRails: HomeRail[];
  campusRail: HomeRail | null;
  regionRail: HomeRail | null;
  collaborativeRail: HomeRail | null;
};

const loadBookmarksCached = cache(async (userId: string) => {
  const supabase = await createClient();
  return getHomeBookmarks(supabase, userId);
});

const loadRecentBrowseCached = cache(async () => {
  const supabase = await createClient();
  return fetchRecentBrowseCards(supabase);
});

/**
 * 빠른 개인화 — 북마크·최근본·추천(CF 키 없이).
 * 이어서 보기 / For You / 마감임박을 먼저 스트리밍한다.
 */
export async function loadHomePersonalizationPrimary(
  user: User,
  catalog: CardScholarship[]
): Promise<HomePersonalizationPrimary> {
  const [bookmarks, bundle, recent] = await Promise.all([
    loadBookmarksCached(user.id),
    getCachedHomeProfileBundle(user.id),
    loadRecentBrowseCached(),
  ]);

  const profile = bundle.profile;
  const forYou = buildForYouCurated(catalog, {
    interests: profile?.interest_categories ?? null,
    savedItems: bookmarks.cards,
    recentViews: recent,
    collaborativeKeys: new Set(),
  });

  return {
    bookmarkedKeys: bookmarks.keys,
    urgentBookmarks: filterUrgentBookmarks(bookmarks.cards),
    forYou,
    serverRecent: recent,
    userName: profile?.name ?? null,
    isOnboarded: Boolean(profile?.is_onboarded),
  };
}

/**
 * 느린 개인화 — CF·교내·관심사 레일.
 */
export async function loadHomePersonalizationRails(
  user: User,
  catalog: CardScholarship[]
): Promise<HomePersonalizationRails> {
  const supabase = await createClient();
  const bundlePromise = getCachedHomeProfileBundle(user.id);

  const campusPromise = (async (): Promise<CardScholarship[]> => {
    const { profile } = await bundlePromise;
    if (!profile?.is_onboarded) return [];
    return fetchHomeCampusScholarships(
      supabase,
      user.id,
      profile.school_name
    );
  })();

  const [bundle, cfResult, campusItems, bookmarks, recent] = await Promise.all([
    bundlePromise,
    fetchCollaborativeCards(supabase),
    campusPromise,
    loadBookmarksCached(user.id),
    loadRecentBrowseCached(),
  ]);

  const profile = bundle.profile;
  const isOnboarded = Boolean(profile?.is_onboarded);
  const interests = profile?.interest_categories ?? null;

  if (!isOnboarded && !interests?.length) {
    return {
      interestRails: [],
      campusRail: null,
      regionRail: null,
      collaborativeRail: null,
    };
  }

  const forYou = buildForYouCurated(catalog, {
    interests,
    savedItems: bookmarks.cards,
    recentViews: recent,
    collaborativeKeys: cfResult.keys,
  });

  const assembled = assemblePersonalizedRails({
    catalog,
    forYou,
    interests,
    profile: {
      schoolName: profile?.school_name,
      schoolLocation: profile?.school_location,
      address: profile?.address,
    },
    campusItems: isOnboarded ? campusItems : [],
    collaborativeItems: cfResult.items,
  });

  return {
    interestRails: assembled.interestRails,
    campusRail: isOnboarded ? assembled.campusRail : null,
    regionRail: isOnboarded ? assembled.regionRail : null,
    collaborativeRail: isOnboarded ? assembled.collaborativeRail : null,
  };
}
