import { notFound } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { createClient } from "@/lib/supabase/server";
import BookmarkApplyButtons from "./BookmarkApplyButtons";
import ScholarshipPoster from "./ScholarshipPoster";
import ScholarshipTabs from "./ScholarshipTabs";
import { daysUntilApplyDeadlineKorea, formatApplyPeriodRange, isAlwaysOpenRecruitment } from "@/lib/scholarship-dates";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { getScholarshipScrapCounts } from "@/lib/scholarship-scrap-counts";
import { formatSupportAmount } from "@/lib/support-amount";
import ViewCountIncrementer from "./ViewCountIncrementer";
import LiveEngagementBadges from "./LiveEngagementBadges";

const posterPlaceholderGradient = "from-brand to-[#c00000]";

function getInstitutionTagClass(institutionType: string | null | undefined): string {
  const value = institutionType?.toLowerCase() ?? "";
  if (value.includes("공공") || value.includes("정부")) return "bg-sky-100 text-sky-800";
  if (value.includes("학교") || value.includes("대학")) return "bg-violet-100 text-violet-700";
  if (value.includes("민간") || value.includes("기업")) return "bg-amber-100 text-amber-800";
  return "bg-gray-100 text-gray-700";
}

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

  const currentViewCount = scholarship.view_count ?? 0;
  const { data: bookmarkResult } = await (
    user
      ? supabase
          .from("bookmarks")
          .select("id")
          .eq("user_id", user.id)
          .eq("scholarship_id", scholarshipId)
          .maybeSingle()
      : Promise.resolve({ data: null })
  );
  const initialBookmarked = !!bookmarkResult;
  const scrapCount = scrapCountByScholarship.get(scholarshipId) ?? 0;

  const alwaysOpen = isAlwaysOpenRecruitment(scholarship.apply_end_date);
  const days = alwaysOpen ? null : daysUntilApplyDeadlineKorea(scholarship.apply_end_date);
  const displayName = cleanScholarshipName(scholarship.name);
  const isAdvertisement = scholarship.is_advertisement === true;
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
    <div className="flex min-h-screen flex-col overflow-x-clip bg-[#fff2df]">
      <Navbar currentUser={user} />

      <main className="relative flex-1 overflow-x-clip bg-[#fff2df]">
        <div className="relative mx-auto w-full max-w-7xl overflow-x-hidden px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/55 transition-colors hover:text-ink"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              목록으로 돌아가기
            </Link>

            <div className="flex w-full min-w-0 items-center sm:w-auto sm:justify-end">
              <LiveEngagementBadges
                scholarshipId={scholarshipId}
                initialViewCount={currentViewCount}
                initialScrapCount={scrapCount}
              />
            </div>
          </div>

          <div className="flex w-full flex-col items-start gap-6 overflow-x-hidden md:flex-row md:items-start md:gap-7">
            <div className="w-full shrink-0 md:w-[280px]">
              <div className="aspect-7/9">
                {scholarship.poster_image_url ? (
                  <ScholarshipPoster
                    posterUrl={scholarship.poster_image_url}
                    alt={`${displayName} 포스터`}
                  />
                ) : (
                  <div className={`flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-[#e9d8c5] bg-linear-to-br ${posterPlaceholderGradient} shadow-sm`}>
                    <span className="text-5xl font-bold text-white/30">
                      {scholarship.organization.charAt(0)}
                    </span>
                  </div>
                )}
              </div>

              <BookmarkApplyButtons
                scholarshipId={scholarship.id}
                applyUrl={scholarship.apply_url}
                initialBookmarked={initialBookmarked}
              />
            </div>

            <div className="w-full min-w-0 flex-1 overflow-x-hidden">
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${getInstitutionTagClass(
                    scholarship.institution_type
                  )}`}
                >
                  {scholarship.institution_type}
                </span>
                {days !== null && days >= 0 && (
                  <span className="inline-flex items-center rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold text-white">
                    D-{days}
                  </span>
                )}
              </div>

              <h1 className="wrap-break-word text-[1.65rem] font-extrabold leading-snug tracking-tight text-ink sm:text-[2rem]">
                {displayName}
              </h1>

              <p className="mt-1.5 text-sm text-ink/70">{scholarship.organization}</p>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink/50">
                <span className="inline-flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z" />
                    <circle cx="12" cy="12" r="2.25" />
                  </svg>
                  {currentViewCount.toLocaleString()}
                </span>
                <span className="inline-flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.5 3.75-.75.75a4.5 4.5 0 0 0-6.364 0l-.75-.75a5.625 5.625 0 0 0-7.955 7.955l7.159 7.159a1.125 1.125 0 0 0 1.59 0l7.159-7.159A5.625 5.625 0 0 0 16.5 3.75Z" />
                  </svg>
                  {scrapCount.toLocaleString()}
                </span>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-[#e5d4bf] bg-white">
                <div className="divide-y divide-[#efe3d5] px-5">
                  <div className="flex items-center justify-between gap-4 py-4">
                    <p className="text-sm text-ink/60">{isAdvertisement ? "급여" : "지원 금액"}</p>
                    <p className="text-right text-base font-extrabold text-brand" title={fullSupportAmount}>
                      {supportAmount}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-4">
                    <p className="text-sm text-ink/60">접수 기간</p>
                    <p className="text-right text-sm font-semibold text-ink">
                      {formatApplyPeriodRange(scholarship.apply_start_date, scholarship.apply_end_date)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-4">
                    <p className="text-sm text-ink/60">선발 인원</p>
                    <p className="text-right text-sm font-bold text-ink">
                      {scholarship.selection_count
                        ? `${scholarship.selection_count.toLocaleString()}명`
                        : "제한 없음"}
                    </p>
                  </div>
                </div>
              </div>

              {(isAdvertisement && scholarship.ad_job_role) || (!isAdvertisement && scholarship.contact) ? (
                <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-[#fbeca8] px-4 py-3 text-sm text-ink">
                  <span className="mt-0.5 shrink-0 text-[#f08e52]">✉️</span>
                  <span className="wrap-break-word">
                    <strong>{isAdvertisement ? "모집 직무" : "문의처"}</strong>{" "}
                    {isAdvertisement ? scholarship.ad_job_role : scholarship.contact}
                  </span>
                </div>
              ) : null}

              <ScholarshipTabs scholarship={scholarship} />
            </div>
          </div>
        </div>
      </main>
      <ViewCountIncrementer scholarshipId={scholarshipId} />

      <footer className="mt-12 border-t border-[#ead8c5] bg-[#fff2df] py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center text-sm text-ink/70">
            문의 메일:{" "}
            <a
              href="mailto:hyunsun4819@gmail.com"
              className="font-medium text-brand hover:underline"
            >
              hyunsun4819@gmail.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
