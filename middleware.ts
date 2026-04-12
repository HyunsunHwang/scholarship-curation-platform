import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 세션 갱신 (만료된 Access Token을 Refresh Token으로 자동 갱신)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 온보딩 미완료 유저를 /onboarding으로 리다이렉트
  if (user) {
    const isOnboardingPage = request.nextUrl.pathname.startsWith("/onboarding");
    const isApiRoute = request.nextUrl.pathname.startsWith("/api");

    if (!isOnboardingPage && !isApiRoute) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_onboarded")
        .eq("id", user.id)
        .single();

      if (profile && !profile.is_onboarded) {
        const url = request.nextUrl.clone();
        url.pathname = "/onboarding";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * 다음 경로를 제외한 모든 요청에 실행:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico, 이미지 파일
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
