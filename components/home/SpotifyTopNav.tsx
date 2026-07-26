import AirbnbHeader from "./AirbnbHeader";
import { createClient } from "@/lib/supabase/server";
import { getCachedSiteSettings, getHeaderLogoSrc } from "@/lib/public-data";
import type { User } from "@supabase/supabase-js";

export default async function SpotifyTopNav({
  currentUser,
  currentUserRole,
  currentUserName,
  currentUserAvatarUrl,
  urgentBookmarkCount: urgentBookmarkCountProp,
  variant = "expandable",
}: {
  currentUser?: User | null;
  currentUserRole?: string | null;
  currentUserName?: string | null;
  currentUserAvatarUrl?: string | null;
  urgentBookmarkCount?: number;
  /** 호환용 prop — 헤더 UI는 variant와 무관하게 동일 */
  variant?: "expandable" | "compact";
} = {}) {
  const siteSettingsPromise = getCachedSiteSettings();
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
  let user = currentUser ?? null;

  if (currentUser === undefined) {
    supabase = await createClient();
    const {
      data: { user: resolvedUser },
    } = await supabase.auth.getUser();
    user = resolvedUser;
  }

  const siteSettings = await siteSettingsPromise;

  const needsProfileQuery =
    Boolean(user) &&
    (currentUserRole === undefined ||
      currentUserName === undefined ||
      currentUserAvatarUrl === undefined);
  const needsUrgentQuery =
    Boolean(user) && urgentBookmarkCountProp === undefined;

  let role = currentUserRole ?? "";
  let name = currentUserName ?? null;
  let avatarUrl = currentUserAvatarUrl ?? null;
  let urgentBookmarkCount = urgentBookmarkCountProp ?? 0;

  if (needsProfileQuery || needsUrgentQuery) {
    supabase ??= await createClient();
    const [profileResult, urgentCountResult] = await Promise.all([
      needsProfileQuery
        ? supabase
            .from("profiles")
            .select("role, name, avatar_url")
            .eq("id", user!.id)
            .single()
        : Promise.resolve({ data: null, error: null }),
      needsUrgentQuery
        ? supabase.rpc("get_urgent_bookmark_count", {
            p_user_id: user!.id,
            p_deadline_days: 6,
          })
        : Promise.resolve({ data: urgentBookmarkCount, error: null }),
    ]);

    if (profileResult.data) {
      if (currentUserRole === undefined) role = profileResult.data.role ?? "";
      if (currentUserName === undefined) name = profileResult.data.name ?? null;
      if (currentUserAvatarUrl === undefined) {
        avatarUrl = profileResult.data.avatar_url ?? null;
      }
    }
    if (!urgentCountResult.error && needsUrgentQuery) {
      urgentBookmarkCount = Number(urgentCountResult.data ?? 0);
    }
  }

  const isAdmin = role === "admin";
  const headerLogoSrc = getHeaderLogoSrc(siteSettings);
  const profileTitle = name ?? user?.email ?? "프로필";

  return (
    <AirbnbHeader
      logoSrc={headerLogoSrc}
      isLoggedIn={Boolean(user)}
      isAdmin={isAdmin}
      profileTitle={profileTitle}
      profileAvatarUrl={avatarUrl}
      urgentBookmarkCount={urgentBookmarkCount}
      variant={variant}
    />
  );
}
