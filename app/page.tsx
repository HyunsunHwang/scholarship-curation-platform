import dynamic from "next/dynamic";
import SpotifyTopNav from "@/components/home/SpotifyTopNav";
import type { CardScholarship } from "@/components/ScholarshipCard";
import { getCachedHomeScholarships } from "@/lib/public-data";
import { createClient } from "@/lib/supabase/server";
import { getBookmarkedScholarshipIds } from "@/lib/user-bookmarks";
import { getScholarshipScrapCounts } from "@/lib/scholarship-scrap-counts";
import { isScholarshipExpired } from "@/lib/scholarship-dates";

const SpotifyHomeShell = dynamic(
  () => import("@/components/home/SpotifyHomeShell"),
  {
    loading: () => (
      <div className="flex min-h-0 flex-1 gap-2 bg-beige p-2 sm:p-2.5">
        <div className="hidden h-full w-[280px] animate-pulse rounded-2xl bg-white xl:block" />
        <div className="flex-1 animate-pulse rounded-2xl bg-white" />
      </div>
    ),
  }
);

export default async function Home() {
  const homeScholarships = await getCachedHomeScholarships();

  const authSupabase = await createClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();

  let bookmarkedIds: number[] = [];
  let bookmarkedScholarships: CardScholarship[] = [];

  if (user) {
    bookmarkedIds = await getBookmarkedScholarshipIds(authSupabase, user.id);

    if (bookmarkedIds.length > 0) {
      const homeById = new Map(homeScholarships.map((s) => [s.id, s]));
      const missingIds = bookmarkedIds.filter((id) => !homeById.has(id));

      let extraRows: CardScholarship[] = [];
      if (missingIds.length > 0) {
        const [{ data: rows }, scrapCounts] = await Promise.all([
          authSupabase
            .from("scholarships")
            .select(
              "id, name, organization, institution_type, support_types, support_amount_text, apply_end_date, poster_image_url, created_at, view_count, is_recommended, recommended_sort_order, is_advertisement"
            )
            .in("id", missingIds),
          getScholarshipScrapCounts(authSupabase, missingIds),
        ]);
        extraRows = (rows ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          organization: s.organization,
          institution_type: s.institution_type as string,
          support_types: s.support_types as string[],
          support_amount_text: s.support_amount_text,
          apply_end_date: s.apply_end_date,
          poster_image_url: s.poster_image_url ?? null,
          created_at: s.created_at,
          view_count: s.view_count,
          scrap_count: scrapCounts.get(s.id) ?? 0,
          is_recommended: s.is_recommended,
          recommended_sort_order: s.recommended_sort_order,
          is_advertisement: s.is_advertisement,
        }));
      }

      const extraById = new Map(extraRows.map((s) => [s.id, s]));
      bookmarkedScholarships = bookmarkedIds.flatMap((id) => {
        const s = homeById.get(id) ?? extraById.get(id);
        if (!s) return [];
        if (isScholarshipExpired(s.apply_end_date)) return [];
        return [s];
      });
    }
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-beige">
      <SpotifyTopNav currentUser={user} />
      <main className="flex min-h-0 flex-1 flex-col">
        <SpotifyHomeShell
          isLoggedIn={Boolean(user)}
          scholarships={homeScholarships}
          bookmarkedScholarships={bookmarkedScholarships}
          bookmarkedIds={bookmarkedIds}
        />
      </main>
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
