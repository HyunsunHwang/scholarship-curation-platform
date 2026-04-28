import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";

export default async function Navbar() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { role: string; name: string | null } | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("role, name")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  const isAdmin = profile?.role === "admin";
  const displayName = profile?.name ?? user?.email ?? "";

  const { data: siteSettings } = await supabase
    .from("site_settings")
    .select("header_logo_url, updated_at")
    .eq("id", 1)
    .maybeSingle();

  const headerLogoSrc =
    siteSettings?.header_logo_url &&
    `${siteSettings.header_logo_url}${
      siteSettings.header_logo_url.includes("?") ? "&" : "?"
    }v=${encodeURIComponent(siteSettings.updated_at)}`;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <BrandLogo logoSrc={headerLogoSrc || undefined} />

        {/* 우측 액션 영역 */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              {/* 관리자 패널 링크 */}
              {isAdmin && (
                <Link
                  href="/admin"
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/20"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                    />
                  </svg>
                  관리자 패널
                </Link>
              )}

              {/* 북마크(마이페이지) 버튼 */}
              <Link
                href="/mypage"
                aria-label="마이페이지"
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink/60 transition-colors hover:bg-[#fff0f0] hover:text-brand"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
                  />
                </svg>
              </Link>

              {/* 유저 아바타 + 이름 */}
              <Link
                href="/mypage"
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-[#fff0f0]"
              >
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                    isAdmin ? "bg-brand" : "bg-peach"
                  }`}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <span className="hidden text-sm font-medium text-ink sm:block max-w-[120px] truncate">
                  {displayName}
                </span>
                {isAdmin && (
                  <span className="hidden sm:inline-flex items-center rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                    ADMIN
                  </span>
                )}
              </Link>

              {/* 로그아웃 버튼 */}
              <form action={logout}>
                <button
                  type="submit"
                  className="inline-flex h-7 items-center rounded-lg px-2.5 text-sm font-medium text-ink/60 transition-colors hover:bg-[#fff0f0] hover:text-ink"
                >
                  로그아웃
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/auth"
                className="inline-flex h-7 items-center rounded-lg px-2.5 text-sm font-medium text-ink/70 transition-colors hover:bg-[#fff0f0] hover:text-ink"
              >
                로그인
              </Link>
              <Link
                href="/auth"
                className="inline-flex h-7 items-center rounded-lg bg-brand px-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/85"
              >
                회원가입
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
