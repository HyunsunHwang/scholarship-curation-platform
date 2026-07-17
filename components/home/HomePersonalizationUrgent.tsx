import type { User } from "@supabase/supabase-js";
import type { CardScholarship } from "@/components/ScholarshipCard";
import HomePersonalizationUrgentBlocks from "@/components/home/HomePersonalizationUrgentBlocks";
import { loadHomePersonalizationPrimary } from "@/lib/home-personalization";

/** Primary와 동일 캐시를 쓰며 TOP10 뒤에 마감임박만 붙인다 */
export default async function HomePersonalizationUrgent({
  catalog,
  user,
}: {
  catalog: CardScholarship[];
  user: User;
}) {
  const data = await loadHomePersonalizationPrimary(user, catalog);
  if (data.urgentBookmarks.length === 0) return null;
  return (
    <HomePersonalizationUrgentBlocks
      urgentBookmarks={data.urgentBookmarks}
    />
  );
}
