import type { User } from "@supabase/supabase-js";
import { getCachedHomeProfileBundle } from "@/lib/home-profile-bundle";

export type NavUserContext = {
  role: string | null;
  name: string | null;
  urgentBookmarkCount: number;
};

/**
 * Navbar / SpotifyTopNav용 컨텍스트.
 * 홈에서는 getCachedHomeProfileBundle과 요청 단위로 공유된다.
 */
export async function resolveNavUserContext(
  user: User | null | undefined
): Promise<NavUserContext> {
  if (!user) {
    return { role: null, name: null, urgentBookmarkCount: 0 };
  }

  const { profile, urgentBookmarkCount } = await getCachedHomeProfileBundle(
    user.id
  );

  return {
    role: profile?.role ?? null,
    name: profile?.name ?? null,
    urgentBookmarkCount,
  };
}
