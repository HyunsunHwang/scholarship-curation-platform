import type { User } from "@supabase/supabase-js";
import type { CardScholarship } from "@/components/ScholarshipCard";
import HomePersonalizationPrimaryBlocks from "@/components/home/HomePersonalizationPrimaryBlocks";
import { loadHomePersonalizationPrimary } from "@/lib/home-personalization";

export default async function HomePersonalizationPrimary({
  catalog,
  user,
}: {
  catalog: CardScholarship[];
  user: User;
}) {
  const data = await loadHomePersonalizationPrimary(user, catalog);
  return (
    <HomePersonalizationPrimaryBlocks
      catalog={catalog}
      bookmarkedKeys={data.bookmarkedKeys}
      forYou={data.forYou}
      serverRecent={data.serverRecent}
      userName={data.userName}
      isOnboarded={data.isOnboarded}
    />
  );
}
