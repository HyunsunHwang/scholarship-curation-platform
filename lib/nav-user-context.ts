import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type NavUserContext = {
  role: string | null;
  name: string | null;
  urgentBookmarkCount: number;
};

/**
 * Navbar / SpotifyTopNav가 각각 getUser·프로필·긴급 북마크를
 * 다시 치지 않도록 페이지에서 한 번만 조회해 넘긴다.
 */
export async function resolveNavUserContext(
  user: User | null | undefined
): Promise<NavUserContext> {
  if (!user) {
    return { role: null, name: null, urgentBookmarkCount: 0 };
  }

  const supabase = await createClient();
  const [profileResult, urgentCountResult] = await Promise.all([
    supabase.from("profiles").select("role, name").eq("id", user.id).single(),
    supabase.rpc("get_urgent_bookmark_count", {
      p_user_id: user.id,
      p_deadline_days: 6,
    }),
  ]);

  return {
    role: profileResult.data?.role ?? null,
    name: profileResult.data?.name ?? null,
    urgentBookmarkCount: urgentCountResult.error
      ? 0
      : Number(urgentCountResult.data ?? 0),
  };
}
