import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCachedHomeContests,
  getCachedHomeScholarships,
} from "@/lib/public-data";
import type { CardScholarship } from "@/components/ScholarshipCard";
import {
  buildForYouCurated,
  buildInterestRails,
  buildTop10,
  HOME_RAIL_ITEM_LIMIT,
  type HomeRail,
} from "@/lib/home-rails";
import {
  fetchCollaborativeCards,
  fetchRecentBrowseCards,
} from "@/lib/home-rails-server";
import { getBookmarkedScholarships } from "@/lib/user-bookmarks";
import { getActiveRankVariant } from "@/lib/home-ranking-weights";

export type HomeRailApiResponse = {
  rail: string;
  items: CardScholarship[];
  rails?: HomeRail[];
  meta: {
    rankVariant: "a" | "b";
    cached: boolean;
  };
};

function catalogFromHome(
  scholarships: Awaited<ReturnType<typeof getCachedHomeScholarships>>,
  contests: Awaited<ReturnType<typeof getCachedHomeContests>>
): CardScholarship[] {
  return [
    ...contests,
    ...scholarships.map((s) => ({
      ...s,
      content_kind: "scholarship" as const,
    })),
  ];
}

/**
 * 레일별 홈 데이터 API.
 * - top10: 공개 캐시 (CDN/브라우저)
 * - for_you | collaborative | interest: 로그인 전용, private 캐시
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rail = (searchParams.get("rail") ?? "top10").toLowerCase();
  const rankVariant = getActiveRankVariant();

  if (rail === "top10") {
    const [scholarships, contests] = await Promise.all([
      getCachedHomeScholarships(),
      getCachedHomeContests(),
    ]);
    const catalog = catalogFromHome(scholarships, contests);
    const items = buildTop10(catalog);
    return NextResponse.json(
      {
        rail: "top10",
        items,
        meta: { rankVariant, cached: true },
      } satisfies HomeRailApiResponse,
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=600, max-age=60",
        },
      }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다.", rail },
      { status: 401 }
    );
  }

  if (rail === "collaborative") {
    const { items } = await fetchCollaborativeCards(
      supabase,
      HOME_RAIL_ITEM_LIMIT
    );
    return NextResponse.json(
      {
        rail: "collaborative",
        items,
        meta: { rankVariant, cached: false },
      } satisfies HomeRailApiResponse,
      {
        headers: {
          "Cache-Control": "private, max-age=120",
        },
      }
    );
  }

  if (rail === "for_you") {
    const [
      { data: profile },
      recent,
      { keys: cfKeys },
      bookmarks,
      scholarships,
      contests,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("interest_categories")
        .eq("id", user.id)
        .single(),
      fetchRecentBrowseCards(supabase),
      fetchCollaborativeCards(supabase, HOME_RAIL_ITEM_LIMIT),
      getBookmarkedScholarships(supabase, user.id),
      getCachedHomeScholarships(),
      getCachedHomeContests(),
    ]);

    const catalog = catalogFromHome(scholarships, contests);
    const items = buildForYouCurated(catalog, {
      interests: profile?.interest_categories,
      savedItems: bookmarks,
      recentViews: recent,
      collaborativeKeys: cfKeys,
    });

    return NextResponse.json(
      {
        rail: "for_you",
        items,
        meta: { rankVariant, cached: false },
      } satisfies HomeRailApiResponse,
      { headers: { "Cache-Control": "private, max-age=120" } }
    );
  }

  if (rail === "interest") {
    const [{ data: profile }, scholarships, contests] = await Promise.all([
      supabase
        .from("profiles")
        .select("interest_categories")
        .eq("id", user.id)
        .single(),
      getCachedHomeScholarships(),
      getCachedHomeContests(),
    ]);
    const catalog = catalogFromHome(scholarships, contests);
    const rails = buildInterestRails(catalog, profile?.interest_categories);
    return NextResponse.json(
      {
        rail: "interest",
        items: rails.flatMap((r) => r.items),
        rails,
        meta: { rankVariant, cached: true },
      } satisfies HomeRailApiResponse,
      { headers: { "Cache-Control": "private, max-age=180" } }
    );
  }

  return NextResponse.json(
    {
      error:
        "지원하지 않는 rail 입니다. top10 | for_you | collaborative | interest",
    },
    { status: 400 }
  );
}
