import { redirect } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ScholarshipDashboard from "@/components/ScholarshipDashboard";
import { createClient } from "@/lib/supabase/server";
import type { CardScholarship } from "@/components/ScholarshipCard";
import type { Database } from "@/lib/database.types";
import { isScholarshipExpired } from "@/lib/scholarship-dates";
import { isUniversitySpecificScholarship } from "@/lib/scholarship-university";
import { getCachedUniversityNames } from "@/lib/public-data";
import { getScholarshipScrapCounts } from "@/lib/scholarship-scrap-counts";
import { getBookmarkedScholarshipIds } from "@/lib/user-bookmarks";

export default async function MatchedPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 미로그인 → 로그인 페이지
  if (!user) redirect("/auth");

  // 온보딩 미완료 → 온보딩 (proxy.ts가 처리하지만 명시적으로도 보호)
  const [{ data: profile }, universityNames] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_onboarded, name")
      .eq("id", user.id)
      .single(),
    getCachedUniversityNames(),
  ]);

  if (!profile?.is_onboarded) redirect("/onboarding");

  const [{ data: matched, error }, bookmarkedIds] = await Promise.all([
    supabase.rpc("get_matched_scholarships", {
      p_user_id: user.id,
    }),
    getBookmarkedScholarshipIds(supabase, user.id),
  ]);

  const matchedIds = ((matched ?? []) as Database["public"]["Tables"]["scholarships"]["Row"][]).map((s) => s.id);
  const scrapCountByScholarship = await getScholarshipScrapCounts(
    supabase,
    matchedIds
  );

  // RPC 반환 타입을 CardScholarship으로 변환
  const scholarships: CardScholarship[] = (
    (matched ?? []) as Database["public"]["Tables"]["scholarships"]["Row"][]
  )
    .filter((s) => !isScholarshipExpired(s.apply_end_date))
    .map((s) => ({
      id: s.id,
      name: s.name,
      organization: s.organization,
      institution_type: s.institution_type,
      support_types: s.support_types as string[],
      support_amount: s.support_amount,
      support_amount_text: s.support_amount_text,
      apply_end_date: s.apply_end_date,
      poster_image_url: s.poster_image_url ?? null,
      created_at: s.created_at,
      view_count: s.view_count,
      scrap_count: scrapCountByScholarship.get(s.id) ?? 0,
      scope: isUniversitySpecificScholarship(s, universityNames) ? "campus" : "external",
      is_recommended: s.is_recommended,
      recommended_sort_order: s.recommended_sort_order,
    }));

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar currentUser={user} currentUserName={profile?.name ?? null} />

      <main className="flex-1">
        {/* 상단 헤더 배너 */}
        <div className="bg-white border-b border-gray-200 py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-brand mb-1">
                  맞춤 큐레이션
                </p>
                <h1 className="text-2xl font-bold text-ink">
                  {profile.name ? `${profile.name}님` : "나"}에게 맞는 장학금
                </h1>
                <p className="mt-1 text-sm text-ink/60">
                  프로필 정보를 기반으로 자격 조건이 충족되는 장학금만 모았습니다.
                </p>
              </div>
              <div className="flex gap-3 shrink-0">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-cream transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                  프로필 수정
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-ink/60 hover:bg-cream transition-colors"
                >
                  전체 보기
                </Link>
              </div>
            </div>

            {/* 오류 안내 */}
            {error && (
              <div className="mt-4 rounded-lg bg-brand/10 border border-brand/30 px-4 py-3 text-sm text-brand">
                매칭 중 오류가 발생했습니다: {error.message}
              </div>
            )}
          </div>
        </div>

        {/* 결과 없음 상태 */}
        {!error && scholarships.length === 0 ? (
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 mb-4">
              <svg className="h-8 w-8 text-peach" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0v6" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-ink">현재 조건에 맞는 장학금이 없습니다</p>
            <p className="mt-2 text-sm text-ink/60">
              프로필 정보를 최신 상태로 업데이트하거나, 전체 장학금 목록을 확인해보세요.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                href="/onboarding"
                className="inline-flex items-center rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand/85 transition-colors"
              >
                프로필 업데이트
              </Link>
                <Link
                  href="/"
                  className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-ink hover:bg-cream transition-colors"
                >
                전체 장학금 보기
              </Link>
            </div>
          </div>
        ) : (
          <ScholarshipDashboard
            scholarships={scholarships}
            bookmarkedIds={bookmarkedIds}
            heading="맞춤 장학금"
            showScopeTabs
          />
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-brand">
                <span className="text-xs font-bold text-white">K</span>
              </div>
              <span className="text-sm font-semibold text-ink">쿠넥트</span>
            </div>
            <p className="text-xs text-ink/40">
              © 2026 쿠넥트. 장학금 정보는 각 기관의 공식 발표를 기준으로 합니다.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
