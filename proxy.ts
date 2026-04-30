import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** 리다이렉트 응답에도 세션 갱신 쿠키를 붙여야 로그인 직후 세션이 유실되지 않습니다. */
function redirectWithSessionCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  return redirect;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requiresSessionCheck =
    pathname.startsWith("/auth") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/matched") ||
    pathname.startsWith("/mypage") ||
    pathname.startsWith("/admin");

  if (!requiresSessionCheck) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set({ name, value, ...options });
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value);
          });
        },
      },
    }
  );

  // 보호 라우트에서만 세션 갱신/유저 조회를 수행해 middleware 비용을 줄인다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 온보딩 미완료 유저를 /onboarding으로 리다이렉트
  if (user) {
    const requiresOnboardingCheck =
      pathname.startsWith("/matched") || pathname.startsWith("/mypage");

    if (requiresOnboardingCheck) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_onboarded, role")
        .eq("id", user.id)
        .single();

      if (profile && !profile.is_onboarded) {
        const url = request.nextUrl.clone();
        url.pathname = "/onboarding";
        return redirectWithSessionCookies(url, supabaseResponse);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
