import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type HomeProfileBundle = {
  profile: {
    is_onboarded: boolean | null;
    name: string | null;
    role: string | null;
    interest_categories: string[] | null;
    school_name: string | null;
    school_location: string | null;
    address: string | null;
  } | null;
  urgentBookmarkCount: number;
};

/**
 * 요청당 1회 — 홈 nav + 개인화가 같은 프로필/긴급 북마크를 공유한다.
 */
export const getCachedHomeProfileBundle = cache(
  async (userId: string): Promise<HomeProfileBundle> => {
    const supabase = await createClient();
    const [profileResult, urgentCountResult] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "is_onboarded, name, role, interest_categories, school_name, school_location, address"
        )
        .eq("id", userId)
        .single(),
      supabase.rpc("get_urgent_bookmark_count", {
        p_user_id: userId,
        p_deadline_days: 6,
      }),
    ]);

    return {
      profile: profileResult.data,
      urgentBookmarkCount: urgentCountResult.error
        ? 0
        : Number(urgentCountResult.data ?? 0),
    };
  }
);
