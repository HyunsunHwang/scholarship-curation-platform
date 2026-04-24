import { notFound } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { createClient } from "@/lib/supabase/server";
import BookmarkApplyButtons from "./BookmarkApplyButtons";
import ScholarshipTabs from "./ScholarshipTabs";
import { formatApplyPeriodRange, isAlwaysOpenRecruitment } from "@/lib/scholarship-dates";

function formatAmount(won: number): string {
  if (won === 0) return "전액";
  const manWon = won / 10000;
  if (manWon >= 10000) return `연 ${(manWon / 10000).toFixed(0)}억원`;
  if (manWon >= 1) return `연 ${manWon.toLocaleString()}만원`;
  return `연 ${won.toLocaleString()}원`;
}

function getDaysUntilDeadline(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(dateStr);
  return Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const institutionGradient: Record<string, string> = {
  국가기관: "from-indigo-400 to-blue-700",
  공공기관: "from-blue-400 to-cyan-600",
  지방자치단체: "from-orange-400 to-amber-600",
  기업: "from-violet-400 to-purple-600",
  재단법인: "from-emerald-400 to-teal-600",
  학교법인: "from-cyan-400 to-sky-600",
  "언론/방송": "from-red-400 to-rose-600",
  종교단체: "from-yellow-400 to-amber-600",
  기타: "from-gray-400 to-gray-600",
};

export default async function ScholarshipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scholarshipId = parseInt(id, 10);
  if (isNaN(scholarshipId)) notFound();

  const supabase = await createClient();

  const [{ data: scholarship }, { data: { user } }] = await Promise.all([
    supabase.from("scholarships").select("*").eq("id", scholarshipId).single(),
    supabase.auth.getUser(),
  ]);

  if (!scholarship) notFound();

  let initialBookmarked = false;
  if (user) {
    const { data: bm } = await supabase
      .from("bookmarks")
      .select("id")
      .eq("user_id", user.id)
      .eq("scholarship_id", scholarshipId)
      .maybeSingle();
    initialBookmarked = !!bm;
  }

  const alwaysOpen = isAlwaysOpenRecruitment(scholarship.apply_end_date);
  const days = alwaysOpen ? null : getDaysUntilDeadline(scholarship.apply_end_date);
  const gradient = institutionGradient[scholarship.institution_type] ?? "from-gray-400 to-gray-600";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar />

      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">

          {/* ── 상단 네비 바 ── */}
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              목록으로 돌아가기
            </Link>

            {scholarship.homepage_url && (
              <a
                href={scholarship.homepage_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-gray-600 shadow-sm transition hover:bg-gray-50"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                공식 홈페이지
              </a>
            )}
          </div>

          {/* ── 2열 메인 레이아웃 ── */}
          <div className="flex gap-8 items-start flex-col md:flex-row">

            {/* ── 왼쪽 sticky 패널 ── */}
            <div className="w-full md:w-56 shrink-0 md:sticky md:top-6">
              {/* 포스터 */}
              <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm aspect-2/3">
                {scholarship.poster_image_url ? (
                  <img
                    src={scholarship.poster_image_url}
                    alt={`${scholarship.name} 포스터`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className={`h-full w-full bg-linear-to-br ${gradient} flex items-center justify-center`}>
                    <span className="text-5xl font-bold text-white/30">
                      {scholarship.organization.charAt(0)}
                    </span>
                  </div>
                )}
              </div>

              {/* 지원하기 / 스크랩 버튼 */}
              <BookmarkApplyButtons
                scholarshipId={scholarship.id}
                applyUrl={scholarship.apply_url}
                initialBookmarked={initialBookmarked}
              />
            </div>

            {/* ── 오른쪽 콘텐츠 ── */}
            <div className="flex-1 min-w-0">

              {/* 제목 */}
              <h1 className="text-2xl font-bold leading-snug text-gray-900 sm:text-3xl">
                {scholarship.name}
              </h1>

              {/* 기관 뱃지 */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br ${gradient} shrink-0`}>
                  <span className="text-xs font-bold text-white">
                    {scholarship.organization.charAt(0)}
                  </span>
                </div>
                <span className="text-sm font-semibold text-gray-700">
                  {scholarship.organization}
                </span>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                  {scholarship.institution_type}
                </span>
                {scholarship.is_verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    검증된 정보
                  </span>
                )}
              </div>

              {/* ── 핵심 요약 카드 ── */}
              <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 divide-y divide-gray-200">
                <div className="px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">핵심 요약</p>
                </div>

                {/* 지원 금액 */}
                <div className="flex items-center gap-4 px-4 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-lg">💰</div>
                  <div>
                    <p className="text-xs text-gray-400">지원 금액</p>
                    <p className="mt-0.5 text-base font-extrabold text-indigo-600">
                      {formatAmount(scholarship.support_amount)}
                    </p>
                  </div>
                </div>

                {/* 접수 기간 */}
                <div className="flex items-center gap-4 px-4 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-lg">📅</div>
                  <div>
                    <p className="text-xs text-gray-400">접수 기간</p>
                    <p className={`mt-0.5 text-sm font-semibold ${
                      days !== null && days <= 7 ? "text-red-600" : "text-gray-800"
                    }`}>
                      {formatApplyPeriodRange(scholarship.apply_start_date, scholarship.apply_end_date)}
                      {days !== null && days >= 0 && days <= 7 && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                          D-{days}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* 선발 인원 */}
                <div className="flex items-center gap-4 px-4 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-lg">👥</div>
                  <div>
                    <p className="text-xs text-gray-400">선발 인원</p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-800">
                      {scholarship.selection_count
                        ? `${scholarship.selection_count.toLocaleString()}명`
                        : "제한 없음"}
                    </p>
                  </div>
                </div>

                {/* 문의처 */}
                {scholarship.contact && (
                  <div className="flex items-center gap-4 px-4 py-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-lg">📞</div>
                    <div>
                      <p className="text-xs text-gray-400">문의처</p>
                      <p className="mt-0.5 text-sm font-semibold text-gray-800 whitespace-pre-line">
                        {scholarship.contact}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── 탭 네비 + 콘텐츠 ── */}
              <ScholarshipTabs scholarship={scholarship} />
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-12 border-t border-gray-100 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-600">
                <span className="text-xs font-bold text-white">K</span>
              </div>
              <span className="text-sm font-semibold text-gray-700">쿠넥트</span>
            </div>
            <p className="text-xs text-gray-400">
              © 2026 쿠넥트. 장학금 정보는 각 기관의 공식 발표를 기준으로 합니다.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
