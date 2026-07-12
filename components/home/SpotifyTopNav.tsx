import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import BrandLogo from "@/components/BrandLogo";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";
import { getCachedSiteSettings, getHeaderLogoSrc } from "@/lib/public-data";
import HomeSearchBar from "./HomeSearchBar";

export default async function SpotifyTopNav({
  currentUser,
  currentUserRole,
  currentUserName,
  urgentBookmarkCount: urgentBookmarkCountProp,
}: {
  currentUser?: User | null;
  currentUserRole?: string | null;
  currentUserName?: string | null;
  urgentBookmarkCount?: number;
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

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200/80 bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/90">
      <div className="flex h-14 items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-4 lg:px-5">
        {/* 좌: 로고 + 홈 */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <BrandLogo
            logoSrc={headerLogoSrc || undefined}
            priority
            className="h-9 max-h-9 max-w-[120px] sm:h-11 sm:max-h-11 sm:max-w-[160px] md:h-12 md:max-h-12 md:max-w-[200px]"
          />
          <Link
            href="/"
            aria-label="홈"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-beige text-ink/70 transition-colors hover:bg-cream hover:text-brand sm:h-10 sm:w-10"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="currentColor"
            >
              <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z" />
              <path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z" />
            </svg>
          </Link>
        </div>

        {/* 중앙: 검색 */}
        <div className="mx-auto min-w-0 flex-1 max-w-xl px-1 sm:px-2">
          <HomeSearchBar />
        </div>

        {/* 우: 액션 */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {user ? (
            <>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="hidden rounded-full border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/20 sm:inline-flex"
                >
                  관리자
                </Link>
              )}
              <Link
                href="/mypage"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-beige text-ink/70 transition-colors hover:bg-cream hover:text-brand sm:h-10 sm:w-10"
                aria-label="마이페이지"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a3 3 0 0 1-5.714 0m5.714 0H9.143"
                  />
                </svg>
                {urgentBookmarkCount > 0 && (
                  <span className="absolute right-0 top-0 flex h-4 min-w-4 translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                    {urgentBookmarkCount > 99 ? "99+" : urgentBookmarkCount}
                  </span>
                )}
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  className="hidden rounded-full px-3 py-1.5 text-sm font-medium text-ink/60 transition-colors hover:bg-cream hover:text-ink sm:inline-flex"
                >
                  로그아웃
                </button>
              </form>
              <Link
                href="/mypage"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white sm:h-9 sm:w-9"
                aria-label="프로필"
                title={profile?.name ?? user.email ?? "프로필"}
              >
                {displayInitial}
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/auth"
                className="hidden text-sm font-medium text-ink/60 transition-colors hover:text-ink sm:inline-flex"
              >
                가입하기
              </Link>
              <Link
                href="/auth"
                className="inline-flex h-8 items-center rounded-full bg-brand px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand/85 sm:h-9 sm:px-5 sm:text-sm"
              >
                로그인하기
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
