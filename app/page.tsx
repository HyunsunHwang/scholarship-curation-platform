import { Suspense } from "react";
import SpotifyTopNav from "@/components/home/SpotifyTopNav";
import HomeSearchRoot from "@/components/home/HomeSearchRoot";
import HomePersonalized from "@/components/home/HomePersonalized";
import SpotifyHomeShell from "@/components/home/SpotifyHomeShell";
import { HomeFeedLoadingFallback } from "@/components/skeletons/HomeLoadingSkeleton";
import type { CardScholarship } from "@/components/ScholarshipCard";
import { getCachedHomeScholarships, getCachedHomeContests } from "@/lib/public-data";
import { createClient } from "@/lib/supabase/server";
import { resolveNavUserContext } from "@/lib/nav-user-context";

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

  const catalog: CardScholarship[] = [
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

  // Nav는 Suspense 밖에 두어 개인화 피드 교체 시 헤더가 다시 깔리지 않게 한다
  const navContext = await resolveNavUserContext(user);

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
          {user ? (
            <Suspense fallback={<HomeFeedLoadingFallback />}>
              <HomePersonalized catalog={catalog} user={user} />
            </Suspense>
          ) : (
            <SpotifyHomeShell
              scholarships={catalog}
              bookmarkedKeys={[]}
              isLoggedIn={false}
            />
          )}
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
