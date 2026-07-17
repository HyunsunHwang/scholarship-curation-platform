import type { User } from "@supabase/supabase-js";
import type { CardScholarship } from "@/components/ScholarshipCard";
import SpotifyHomeShell from "@/components/home/SpotifyHomeShell";
import { loadHomePersonalization } from "@/lib/home-personalization";

/**
 * 로그인 홈 피드만 — TopNav는 page에서 고정해 Suspense 교체 시 그림자/레이아웃 깜빡임을 줄인다.
 */
export default async function HomePersonalized({
  catalog,
  user,
}: {
  catalog: CardScholarship[];
  user: User;
}) {
  const data = await loadHomePersonalization(user, catalog);

  return (
    <SpotifyHomeShell
      scholarships={catalog}
      bookmarkedKeys={data.bookmarkedKeys}
      forYou={data.forYou}
      urgentBookmarks={data.urgentBookmarks}
      serverRecent={data.serverRecent}
      interestRails={data.interestRails}
      campusRail={data.campusRail}
      regionRail={data.regionRail}
      collaborativeRail={data.collaborativeRail}
      userName={data.userName}
      isLoggedIn
      isOnboarded={data.isOnboarded}
    />
  );
}
