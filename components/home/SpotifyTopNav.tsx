import AirbnbHeader from "./AirbnbHeader";
import { createClient } from "@/lib/supabase/server";
import { getCachedSiteSettings, getHeaderLogoSrc } from "@/lib/public-data";
import type { User } from "@supabase/supabase-js";

export default async function SpotifyTopNav({
  currentUser,
  currentUserRole,
  currentUserName,
  urgentBookmarkCount: urgentBookmarkCountProp,
  variant = "expandable",
}: {
  currentUser?: User | null;
  currentUserRole?: string | null;
  currentUserName?: string | null;
  urgentBookmarkCount?: number;
  /** compact: 상세 등 — 항상 검색 헤더(카테고리 탭 없음) */
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

  let profile: { role: string; name: string | null } | null =
    currentUserRole !== undefined || currentUserName !== undefined
      ? { role: currentUserRole ?? "", name: currentUserName ?? null }
      : null;
  let urgentBookmarkCount = urgentBookmarkCountProp ?? 0;

  if (user && (!profile || urgentBookmarkCountProp === undefined)) {
    supabase ??= await createClient();
    const [profileResult, urgentCountResult] = await Promise.all([
      profile
        ? Promise.resolve({ data: profile })
        : supabase
            .from("profiles")
            .select("role, name")
            .eq("id", user.id)
            .single(),
      urgentBookmarkCountProp !== undefined
        ? Promise.resolve({ data: urgentBookmarkCountProp, error: null })
        : supabase.rpc("get_urgent_bookmark_count", {
            p_user_id: user.id,
            p_deadline_days: 6,
          }),
    ]);
    profile = profileResult.data;
    if (!urgentCountResult.error) {
      urgentBookmarkCount = Number(urgentCountResult.data ?? 0);
    }
  }

  const isAdmin = profile?.role === "admin";
  const headerLogoSrc = getHeaderLogoSrc(siteSettings);
  const displayInitial = (
    profile?.name?.trim()?.charAt(0) ||
    user?.email?.charAt(0) ||
    "?"
  ).toUpperCase();
  const profileTitle = profile?.name ?? user?.email ?? "프로필";

  return (
    <AirbnbHeader
      logoSrc={headerLogoSrc}
      isLoggedIn={Boolean(user)}
      isAdmin={isAdmin}
      displayInitial={displayInitial}
      profileTitle={profileTitle}
      urgentBookmarkCount={urgentBookmarkCount}
      variant={variant}
    />
  );
}
