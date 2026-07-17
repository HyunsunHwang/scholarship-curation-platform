import type { User } from "@supabase/supabase-js";
import type { CardScholarship } from "@/components/ScholarshipCard";
import HomePersonalizationRailBlocks from "@/components/home/HomePersonalizationRailBlocks";
import { loadHomePersonalizationRails } from "@/lib/home-personalization";

export default async function HomePersonalizationRails({
  catalog,
  user,
}: {
  catalog: CardScholarship[];
  user: User;
}) {
  const data = await loadHomePersonalizationRails(user, catalog);
  return (
    <HomePersonalizationRailBlocks
      interestRails={data.interestRails}
      campusRail={data.campusRail}
      regionRail={data.regionRail}
      collaborativeRail={data.collaborativeRail}
    />
  );
}
