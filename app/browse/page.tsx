import BrowseExploreHub from "@/components/browse/BrowseExploreHub";
import BrowseFeed from "@/components/browse/BrowseFeed";
import HomeSearchRoot from "@/components/home/HomeSearchRoot";
import SpotifyTopNav from "@/components/home/SpotifyTopNav";
import type { CardScholarship } from "@/components/ScholarshipCard";
import {
  BROWSE_PAGE_SIZE,
  fetchBrowseExploreTiles,
  fetchBrowsePage,
  fetchBrowseTopRank,
  parseBrowseParams,
} from "@/lib/browse-data";
import { createClient } from "@/lib/supabase/server";
import { getBookmarkedCardKeys } from "@/lib/user-bookmarks";
import { resolveNavUserContext } from "@/lib/nav-user-context";

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const pick = (key: string) => {
    const v = raw[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const { kind, sort, section, page, list } = parseBrowseParams({
    kind: pick("kind"),
    sort: pick("sort"),
    section: pick("section"),
    page: pick("page"),
    list: pick("list"),
  });

  const authSupabase = await createClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  const navContext = await resolveNavUserContext(user);

  if (!list) {
    const tiles = await fetchBrowseExploreTiles();
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
          <BrowseExploreHub tiles={tiles} />
        </main>
      </div>
    );
  }

  const [{ items, totalCount, totalPages }, bookmarkedKeys, topRank] =
    await Promise.all([
      fetchBrowsePage({
        kind,
        sort,
        section,
        page,
        pageSize: BROWSE_PAGE_SIZE,
      }),
      user
        ? getBookmarkedCardKeys(authSupabase, user.id)
        : Promise.resolve([] as string[]),
      // 1페이지에서만 배너용 TOP 10 조회
      page <= 1
        ? fetchBrowseTopRank({ kind, section })
        : Promise.resolve([] as CardScholarship[]),
    ]);

  const safePage = Math.min(page, totalPages);

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
        <BrowseFeed
          items={items as CardScholarship[]}
          page={safePage}
          totalPages={totalPages}
          totalCount={totalCount}
          kind={kind}
          sort={sort}
          section={section}
          bookmarkedKeys={bookmarkedKeys}
          topRank={topRank}
        />
      </main>
    </div>
  );
}
