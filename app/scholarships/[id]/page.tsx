import { notFound } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { createClient } from "@/lib/supabase/server";
import BookmarkApplyButtons from "./BookmarkApplyButtons";
import ScholarshipPoster from "./ScholarshipPoster";
import ScholarshipTabs from "./ScholarshipTabs";
import {
  daysUntilApplyDeadlineKorea,
  formatApplyPeriodRange,
  isAlwaysOpenRecruitment,
} from "@/lib/scholarship-dates";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { getScholarshipScrapCounts } from "@/lib/scholarship-scrap-counts";
import { formatSupportAmount } from "@/lib/support-amount";

/** 포스터 없을 때 플레이스홀더 — 랜딩 히어로와 동일한 브랜드 그라데이션 */
const posterPlaceholderGradient = "from-brand to-[#c00000]";

export default async function ScholarshipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scholarshipId = parseInt(id, 10);
  if (isNaN(scholarshipId)) notFound();

  const supabase = await createClient();

  const [{ data: scholarship }, { data: { user } }, scrapCountByScholarship] = await Promise.all([
    supabase.from("scholarships").select("*").eq("id", scholarshipId).single(),
    supabase.auth.getUser(),
    getScholarshipScrapCounts(supabase, [scholarshipId]),
  ]);

  if (!scholarship) notFound();

  const nextViewCount = (scholarship.view_count ?? 0) + 1;
  const [bookmarkResult] = await Promise.all([
    user
      ? supabase
          .from("bookmarks")
          .select("id")
          .eq("user_id", user.id)
          .eq("scholarship_id", scholarshipId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("scholarships")
      .update({ view_count: nextViewCount })
      .eq("id", scholarshipId),
  ]);
  const initialBookmarked = !!bookmarkResult.data;
  const scrapCount = scrapCountByScholarship.get(scholarshipId) ?? 0;

  const alwaysOpen = isAlwaysOpenRecruitment(scholarship.apply_end_date);
  const days = alwaysOpen ? null : daysUntilApplyDeadlineKorea(scholarship.apply_end_date);
  const displayName = cleanScholarshipName(scholarship.name);
  const supportAmount = formatSupportAmount(
    scholarship.support_amount,
    scholarship.support_amount_text,
    { compact: true }
  );
  const fullSupportAmount = formatSupportAmount(
    scholarship.support_amount,
    scholarship.support_amount_text
  );

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar currentUser={user} />

      <main className="relative flex-1 overflow-hidden bg-white">
        {/* 히어로와 동일한 배경 장식 */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-brand/8 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 -left-16 h-64 w-64 rounded-full bg-brand/5 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10">

          {/* ── 상단 네비 바 ── */}
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-ink/55 transition-colors hover:text-ink"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              목록으로 돌아가기
            </Link>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-ink/70 shadow-sm">
                <svg className="h-3.5 w-3.5 text-ink/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12s-3.75 6.75-9.75 6.75S2.25 12 2.25 12Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0Z" />
                </svg>
                조회 {nextViewCount.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-ink/70 shadow-sm">
                <svg className="h-3.5 w-3.5 text-ink/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0Z" />
                </svg>
                스크랩 {(scrapCount ?? 0).toLocaleString()}
              </span>
            </div>
          </div>

          {/* ── 2열 메인 레이아웃 ── */}
          <div className="flex gap-8 items-start flex-col md:flex-row">

            {/* ── 왼쪽 sticky 패널 ── */}
            <div className="w-full md:w-56 shrink-0 md:sticky md:top-6">
              {/* 포스터 */}
              <div className="aspect-2/3">
                {scholarship.poster_image_url ? (
                  <ScholarshipPoster
                    posterUrl={scholarship.poster_image_url}
                    alt={`${displayName} 포스터`}
                  />
                ) : (
                  <div className={`h-full w-full overflow-hidden rounded-2xl border border-gray-100 shadow-sm bg-linear-to-br ${posterPlaceholderGradient} flex items-center justify-center aspect-2/3`}>
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
              <h1 className="text-2xl font-extrabold leading-snug tracking-tight text-ink sm:text-3xl">
                {displayName}
              </h1>

              {/* 기관 뱃지 */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-ink">
                  {scholarship.organization}
                </span>
                <span className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-medium text-ink/60">
                  {scholarship.institution_type}
                </span>
              </div>

              {/* ── 핵심 요약 카드 ── */}
              <div className="mt-5 divide-y divide-gray-200/80 rounded-2xl border border-gray-200 bg-cream/60 backdrop-blur-sm">
                <div className="px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-ink/45">핵심 요약</p>
                </div>

                {/* 지원 금액 */}
                <div className="flex items-center gap-4 px-4 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-lg">💰</div>
                  <div className="min-w-0">
                    <p className="text-xs text-ink/50">지원 금액</p>
                    <p className="mt-0.5 truncate text-base font-extrabold text-brand" title={fullSupportAmount}>
                      {supportAmount}
                    </p>
                  </div>
                </div>

                {/* 접수 기간 */}
                <div className="flex items-center gap-4 px-4 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-skyblue/50 text-lg">📅</div>
                  <div>
                    <p className="text-xs text-ink/50">접수 기간</p>
                    <p className={`mt-0.5 text-sm font-semibold ${
                      days !== null && days <= 7 ? "text-brand" : "text-ink"
                    }`}>
                      {formatApplyPeriodRange(scholarship.apply_start_date, scholarship.apply_end_date)}
                      {days !== null && days >= 0 && days <= 7 && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                          D-{days}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* 선발 인원 */}
                <div className="flex items-center gap-4 px-4 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-peach/35 text-lg">👥</div>
                  <div>
                    <p className="text-xs text-ink/50">선발 인원</p>
                    <p className="mt-0.5 text-sm font-semibold text-ink">
                      {scholarship.selection_count
                        ? `${scholarship.selection_count.toLocaleString()}명`
                        : "제한 없음"}
                    </p>
                  </div>
                </div>

                {/* 문의처 */}
                {scholarship.contact && (
                  <div className="flex items-center gap-4 px-4 py-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/8 text-lg">📞</div>
                    <div>
                      <p className="text-xs text-ink/50">문의처</p>
                      <p className="mt-0.5 text-sm font-semibold text-ink whitespace-pre-line">
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

      <footer className="mt-12 border-t border-gray-200 bg-white py-8">
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
