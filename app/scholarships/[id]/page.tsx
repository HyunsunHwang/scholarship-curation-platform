import { notFound } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { createClient } from "@/lib/supabase/server";
import BookmarkApplyButtons from "./BookmarkApplyButtons";
import ScholarshipDetailHero from "./ScholarshipDetailHero";
import ScholarshipPoster from "./ScholarshipPoster";
import ScholarshipTabs from "./ScholarshipTabs";
import { daysUntilApplyDeadlineKorea, isAlwaysOpenRecruitment } from "@/lib/scholarship-dates";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { getScholarshipScrapCounts } from "@/lib/scholarship-scrap-counts";
import { formatSupportAmount } from "@/lib/support-amount";
import ViewCountIncrementer from "./ViewCountIncrementer";
import LiveEngagementBadges from "./LiveEngagementBadges";
import {
  getScholarshipQualMatch,
  hasAutoCheckableQualifications,
  type AutoCheckState,
} from "@/lib/scholarship-qualification-match";

const posterPlaceholderGradient = "from-brand to-[#c00000]";

/** "YYYY-MM-DD" → "YYYY년 M월 D일" (접수 마감에 연도까지 자연스럽게 표기) */
function formatKoreanDate(dateStr: string): string {
  const part = dateStr.split("T")[0];
  const [y, m, d] = part.split("-").map((v) => parseInt(v, 10));
  if (!y || !m || !d) return part;
  return `${y}년 ${m}월 ${d}일`;
}

type ContactChannel = { icon: "mail" | "phone" | "info"; text: string; href: string | null };

/** 자유 텍스트 문의처를 "/" 기준으로 나눠 이메일·전화는 아이콘+링크로, 그 외는 텍스트로 표시 */
function splitContactChannels(raw: string): ContactChannel[] {
  return raw
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const email = part.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
      if (email) return { icon: "mail" as const, text: part, href: `mailto:${email}` };
      const phone = part.match(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{3,4}/)?.[0];
      if (phone) return { icon: "phone" as const, text: part, href: `tel:${phone.replace(/[.\s]/g, "-")}` };
      return { icon: "info" as const, text: part, href: null };
    });
}

function ContactChannelIcon({ icon }: { icon: ContactChannel["icon"] }) {
  if (icon === "mail") {
    return (
      <svg className="h-4 w-4 shrink-0 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0-.414.336-.75.75-.75h18a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75H3a.75.75 0 01-.75-.75V6.75z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.5l9.75 6.75L21.75 7.5" />
      </svg>
    );
  }
  if (icon === "phone") {
    return (
      <svg className="h-4 w-4 shrink-0 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 6.75c0 8.284 6.716 15 15 15h1.5a2.25 2.25 0 002.25-2.25v-1.372a1.5 1.5 0 00-1.164-1.462l-3.328-.808a1.5 1.5 0 00-1.517.475l-.85 1.05a11.25 11.25 0 01-5.66-5.66l1.05-.85a1.5 1.5 0 00.475-1.517l-.808-3.328a1.5 1.5 0 00-1.462-1.164H4.5A2.25 2.25 0 002.25 6.75z"
        />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 shrink-0 text-ink/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    </svg>
  );
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

  const [{ data: scholarship }, { data: { user } }, scrapCountByScholarship, { data: selectionStages }] =
    await Promise.all([
      supabase.from("scholarships").select("*").eq("id", scholarshipId).single(),
      supabase.auth.getUser(),
      getScholarshipScrapCounts(supabase, [scholarshipId]),
      supabase
        .from("scholarship_selection_stages")
        .select("stage_order, title, phase, schedule_date, schedule_text, note")
        .eq("scholarship_id", scholarshipId)
        .order("stage_order"),
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
  const supportAmount = formatSupportAmount(scholarship.support_amount_text);
  const fullSupportAmount = supportAmount;

  const autoCheckApplicable = !isAdvertisement && hasAutoCheckableQualifications(scholarship);
  const qualMatchItems = user && autoCheckApplicable
    ? await getScholarshipQualMatch(supabase, user.id, scholarship)
    : null;
  const autoCheck: AutoCheckState = !autoCheckApplicable
    ? { kind: "none" }
    : qualMatchItems
      ? { kind: "ready", items: qualMatchItems }
      : { kind: "guest", ctaHref: user ? "/onboarding" : "/auth" };

  const posterAlt = `${displayName} 포스터`;
  const organizationInitial = scholarship.organization?.charAt(0) || "장";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* 데스크톱만 상단 네비 — 모바일은 에어비앤비식 풀블리드 히어로 */}
      <div className="hidden md:block">
        <Navbar currentUser={user} />
      </div>

      <main className="relative flex-1 bg-white">
        {/* ── 모바일 히어로 (md 미만) ── */}
        <div className="md:hidden">
          <ScholarshipDetailHero
            scholarshipId={scholarshipId}
            posterUrl={scholarship.poster_image_url}
            alt={posterAlt}
            title={displayName}
            organizationInitial={organizationInitial}
            initialBookmarked={initialBookmarked}
          />
        </div>

        <div className="relative mx-auto w-full max-w-6xl pb-28 md:px-6 md:py-8 md:pb-8 lg:px-8">
          {/* 모바일: 둥근 상단으로 포스터 위에 겹치는 콘텐츠 카드 */}
          <div className="relative z-10 -mt-5 rounded-t-[1.75rem] bg-white px-4 pt-5 sm:px-6 md:mt-0 md:rounded-none md:px-0 md:pt-0">
            {/* 데스크톱 전용: 목록 복귀 + 조회/스크랩 배지 */}
            <div className="mb-6 hidden flex-col gap-3 md:flex md:flex-row md:items-center md:justify-between">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/55 transition-colors hover:text-ink"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                목록으로 돌아가기
              </Link>

              <div className="flex w-full min-w-0 items-center md:w-auto md:justify-end">
                <LiveEngagementBadges
                  scholarshipId={scholarshipId}
                  initialViewCount={currentViewCount}
                  initialScrapCount={scrapCount}
                />
              </div>
            </div>

            <div className="grid w-full grid-cols-1 items-start gap-0 md:grid-cols-[1fr_260px] md:gap-10">
              <div className="w-full min-w-0 overflow-x-hidden md:order-1">
                <p className="text-xs font-medium tracking-wide text-ink/45">
                  {scholarship.institution_type}
                  {!isAdvertisement && scholarship.organization ? ` · ${scholarship.organization}` : null}
                </p>

                <h1 className="wrap-break-word mt-2 text-[1.65rem] font-extrabold leading-snug tracking-tight text-ink sm:text-[2rem]">
                  {displayName}
                </h1>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink/40">
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

                <div className="mt-6 grid grid-cols-2 gap-4 border-t border-gray-100 pt-6">
                  <div>
                    <p className="text-xs text-ink/50">{isAdvertisement ? "급여" : "지원 금액"}</p>
                    <p
                      className="mt-1.5 wrap-break-word text-sm font-bold text-brand"
                      title={fullSupportAmount}
                    >
                      {supportAmount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ink/50">{isAdvertisement ? "마감" : "접수 마감"}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink">
                      {alwaysOpen ? "상시모집" : formatKoreanDate(scholarship.apply_end_date)}
                      {days !== null && days >= 0 && (
                        <span className="inline-flex items-center rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
                          D-{days}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {isAdvertisement && scholarship.ad_job_role && (
                  <div className="mt-6 border-t border-gray-100 pt-6 text-sm text-ink/80">
                    <span className="font-semibold text-ink">모집 직무</span> {scholarship.ad_job_role}
                  </div>
                )}

                <ScholarshipTabs
                  scholarship={scholarship}
                  selectionStages={selectionStages ?? []}
                  autoCheck={autoCheck}
                />

                {!isAdvertisement && scholarship.contact && (
                  <div className="mt-8 border-t border-gray-100 pt-6">
                    <p className="text-xs font-semibold text-ink/40">문의</p>
                    <div className="mt-2 flex flex-col gap-1.5 text-sm">
                      {splitContactChannels(scholarship.contact).map((channel, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 text-ink/70">
                          <ContactChannelIcon icon={channel.icon} />
                          {channel.href ? (
                            <a
                              href={channel.href}
                              className="wrap-break-word font-medium text-brand hover:underline"
                            >
                              {channel.text}
                            </a>
                          ) : (
                            <span className="wrap-break-word">{channel.text}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 데스크톱 사이드 포스터 — 모바일은 히어로로 대체, 하단 고정 바는 유지 */}
              <div className="h-0 w-full overflow-visible md:h-auto md:sticky md:top-20 md:order-2 md:self-start">
                <div className="mb-0 hidden aspect-7/9 md:block">
                  {scholarship.poster_image_url ? (
                    <ScholarshipPoster
                      posterUrl={scholarship.poster_image_url}
                      alt={posterAlt}
                    />
                  ) : (
                    <div className={`flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-linear-to-br ${posterPlaceholderGradient} shadow-sm`}>
                      <span className="text-5xl font-bold text-white/30">
                        {organizationInitial}
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
            </div>
          </div>
        </div>
      </main>
      <ViewCountIncrementer scholarshipId={scholarshipId} />

      <footer className="mt-12 hidden border-t border-gray-100 bg-white py-8 md:block">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center text-sm text-ink/60">
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
