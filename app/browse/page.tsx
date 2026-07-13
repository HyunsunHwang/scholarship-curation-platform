import Navbar from "@/components/Navbar";
import BrowseFeed from "@/components/browse/BrowseFeed";
import type { CardScholarship } from "@/components/ScholarshipCard";
import {
  BROWSE_PAGE_SIZE,
  fetchBrowsePage,
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

  const { kind, sort, section, page } = parseBrowseParams({
    kind: pick("kind"),
    sort: pick("sort"),
    section: pick("section"),
    page: pick("page"),
  });

  const [{ items, totalCount, totalPages }, authSupabase] = await Promise.all([
    fetchBrowsePage({
      kind,
      sort,
      section,
      page,
      pageSize: BROWSE_PAGE_SIZE,
    }),
    createClient(),
  ]);

  const safePage = Math.min(page, totalPages);

  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  const navContext = await resolveNavUserContext(user);

  let bookmarkedKeys: string[] = [];
  if (user) {
    bookmarkedKeys = await getBookmarkedCardKeys(authSupabase, user.id);
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar
        currentUser={user}
        currentUserRole={navContext.role}
        currentUserName={navContext.name}
        urgentBookmarkCount={navContext.urgentBookmarkCount}
      />
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
        />
      </main>
    </div>
  );
}
