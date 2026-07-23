import { Suspense } from "react";
import SpotifyTopNav from "@/components/home/SpotifyTopNav";
import HomeSearchRoot from "@/components/home/HomeSearchRoot";
import SpotifyHomeShell from "@/components/home/SpotifyHomeShell";
import HomePersonalizationPrimary from "@/components/home/HomePersonalizationPrimary";
import HomePersonalizationUrgent from "@/components/home/HomePersonalizationUrgent";
import HomePersonalizationRails from "@/components/home/HomePersonalizationRails";
import HomeGuestSections from "@/components/home/HomeGuestSections";
import { HomePersonalizationShelfFallback } from "@/components/skeletons/HomeLoadingSkeleton";
import NavbarSkeleton from "@/components/skeletons/NavbarSkeleton";
import type { CardScholarship } from "@/components/ScholarshipCard";
import SiteFooter from "@/components/SiteFooter";
import { getCachedHomeScholarships, getCachedHomeContests } from "@/lib/public-data";
import { createClient } from "@/lib/supabase/server";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // 카탈로그(캐시) + auth를 병렬 — 개인화는 아래 Suspense로 미룸
  const [{ q }, homeScholarships, homeContests, user] = await Promise.all([
    searchParams,
    getCachedHomeScholarships(),
    getCachedHomeContests(),
    (async () => {
      const supabase = await createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      return authUser;
    })(),
  ]);
  const initialQuery = typeof q === "string" ? q : "";

  const catalog: CardScholarship[] = [
    ...homeContests,
    ...homeScholarships.map((s) => ({
      ...s,
      content_kind: "scholarship" as const,
    })),
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <HomeSearchRoot initialQuery={initialQuery}>
        {/* 프로필/긴급 수는 nav 내부에서 로드 — 공개 피드 TTFB를 막지 않음 */}
        <Suspense fallback={<NavbarSkeleton />}>
          <SpotifyTopNav currentUser={user} />
        </Suspense>
        <main className="flex-1">
          <SpotifyHomeShell
            scholarships={catalog}
            afterHero={
              user ? (
                <Suspense fallback={<HomePersonalizationShelfFallback />}>
                  <HomePersonalizationPrimary catalog={catalog} user={user} />
                </Suspense>
              ) : (
                // 로그인 For You와 같은 슬롯 — 히어로 바로 아래에 붙여 단절감 줄임
                <HomeGuestSections catalog={catalog} />
              )
            }
            afterTop10={
              user ? (
                <>
                  <Suspense fallback={null}>
                    <HomePersonalizationUrgent catalog={catalog} user={user} />
                  </Suspense>
                  <Suspense fallback={null}>
                    <HomePersonalizationRails catalog={catalog} user={user} />
                  </Suspense>
                </>
              ) : null
            }
          />
        </main>
      </HomeSearchRoot>
      <SiteFooter className="shrink-0" />
    </div>
  );
}
