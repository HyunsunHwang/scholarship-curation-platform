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
import type { NavUserContext } from "@/lib/nav-user-context";
import { getCachedHomeProfileBundle } from "@/lib/home-profile-bundle";
import { createClient } from "@/lib/supabase/server";
import { getHomeBookmarks } from "@/lib/user-bookmarks";

export type HomePersonalization = {
  nav: NavUserContext;
  bookmarkedKeys: string[];
  urgentBookmarks: CardScholarship[];
  forYou: CardScholarship[];
  serverRecent: CardScholarship[];
  interestRails: HomeRail[];
  campusRail: HomeRail | null;
  regionRail: HomeRail | null;
  collaborativeRail: HomeRail | null;
  userName: string | null;
  isOnboarded: boolean;
};

/**
 * 로그인 홈 개인화 데이터를 한 번에 로드한다.
 * - 프로필/긴급 북마크는 getCachedHomeProfileBundle으로 nav와 공유
 * - campus는 프로필 resolve 후 시작하되, 북마크/CF/recent와 병렬
 */
export async function loadHomePersonalization(
  user: User,
  catalog: CardScholarship[]
): Promise<HomePersonalization> {
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

  const [bookmarks, bundle, recent, cfResult, campusItems] = await Promise.all([
    getHomeBookmarks(supabase, user.id),
    bundlePromise,
    fetchRecentBrowseCards(supabase),
    fetchCollaborativeCards(supabase),
    campusPromise,
  ]);

  const profile = bundle.profile;
  const isOnboarded = Boolean(profile?.is_onboarded);
  const userName = profile?.name ?? null;
  const interests = profile?.interest_categories ?? null;
  const profileSignals = {
    schoolName: profile?.school_name,
    schoolLocation: profile?.school_location,
    address: profile?.address,
  };

  const forYou = buildForYouCurated(catalog, {
    interests,
    savedItems: bookmarks.cards,
    recentViews: recent,
    collaborativeKeys: cfResult.keys,
  });

  let interestRails: HomeRail[] = [];
  let campusRail: HomeRail | null = null;
  let regionRail: HomeRail | null = null;
  let collaborativeRail: HomeRail | null = null;

  if (isOnboarded || interests?.length) {
    const assembled = assemblePersonalizedRails({
      catalog,
      forYou,
      interests,
      profile: profileSignals,
      campusItems: isOnboarded ? campusItems : [],
      collaborativeItems: cfResult.items,
    });
    interestRails = assembled.interestRails;
    if (isOnboarded) {
      campusRail = assembled.campusRail;
      regionRail = assembled.regionRail;
      collaborativeRail = assembled.collaborativeRail;
    }
  }

  return {
    nav: {
      role: profile?.role ?? null,
      name: userName,
      urgentBookmarkCount: bundle.urgentBookmarkCount,
    },
    bookmarkedKeys: bookmarks.keys,
    urgentBookmarks: filterUrgentBookmarks(bookmarks.cards),
    forYou,
    serverRecent: recent,
    interestRails,
    campusRail,
    regionRail,
    collaborativeRail,
    userName,
    isOnboarded,
  };
}
