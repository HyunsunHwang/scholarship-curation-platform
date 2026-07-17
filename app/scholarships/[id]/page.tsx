import { notFound } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import SpotifyTopNav from "@/components/home/SpotifyTopNav";
import HomeSearchRoot from "@/components/home/HomeSearchRoot";
import { createClient } from "@/lib/supabase/server";
import BookmarkApplyButtons from "./BookmarkApplyButtons";
import ScholarshipDetailHero from "./ScholarshipDetailHero";
import ScholarshipPoster from "./ScholarshipPoster";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { getScholarshipScrapCounts } from "@/lib/scholarship-scrap-counts";
import { resolveScholarshipBenefits } from "@/lib/benefit-categories";
import BenefitHighlights from "@/components/BenefitHighlights";
import ViewCountIncrementer from "./ViewCountIncrementer";
import RecentViewTracker from "@/components/RecentViewTracker";
import LiveEngagementBadges from "./LiveEngagementBadges";
import {
  getScholarshipQualMatch,
  hasAutoCheckableQualifications,
  type AutoCheckState,
} from "@/lib/scholarship-qualification-match";
import { SCHOLARSHIP_DETAIL_SELECT } from "@/lib/detail-select";
import { resolveNavUserContext } from "@/lib/nav-user-context";
import type { Database } from "@/lib/database.types";
import { PublicScholarshipDetail } from "@/components/public-scholarships/PublicScholarshipDetail";
import {
  getPublicScholarshipDetail,
  getPublicScholarshipReadModelStatus,
  isPublicScholarshipId,
} from "@/lib/scholarships/public-scholarship-read-model";

type ScholarshipRow = Database["public"]["Tables"]["scholarships"]["Row"];

const ScholarshipTabs = dynamic(() => import("./ScholarshipTabs"), {
  loading: () => (
    <div className="mt-8 space-y-4" aria-hidden>
      <div className="h-8 w-40 animate-pulse rounded-lg bg-gray-100" />
      <div className="h-24 w-full animate-pulse rounded-xl bg-gray-100" />
      <div className="h-24 w-full animate-pulse rounded-xl bg-gray-100" />
    </div>
  ),
});

const posterPlaceholderGradient = "from-brand to-[#c00000]";

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
  if (isPublicScholarshipId(id)) {
    const publicScholarship = getPublicScholarshipDetail(id);
    if (!publicScholarship) notFound();
    return (
      <PublicScholarshipDetail
        scholarship={publicScholarship}
        dataStatus={getPublicScholarshipReadModelStatus()}
      />
    );
  }

  const scholarshipId = parseInt(id, 10);
  if (isNaN(scholarshipId)) notFound();

  const supabase = await createClient();

  const [
    scholarshipResult,
    {
      data: { user },
    },
    scrapCountByScholarship,
    { data: selectionStages },
  ] = await Promise.all([
    supabase
      .from("scholarships")
      .select(SCHOLARSHIP_DETAIL_SELECT)
      .eq("id", scholarshipId)
      .eq("is_verified", true)
      .single(),
    supabase.auth.getUser(),
    getScholarshipScrapCounts(supabase, [scholarshipId]),
    supabase
      .from("scholarship_selection_stages")
      .select("stage_order, title, phase, schedule_date, schedule_text, note")
      .eq("scholarship_id", scholarshipId)
      .order("stage_order"),
  ]);

  if (scholarshipResult.error || !scholarshipResult.data) notFound();

  const scholarship = scholarshipResult.data as unknown as ScholarshipRow;
  const scrapCount = scrapCountByScholarship.get(scholarshipId) ?? 0;
  const currentViewCount = scholarship.view_count ?? 0;
  const isAdvertisement = scholarship.is_advertisement === true;
  const autoCheckApplicable =
    !isAdvertisement && hasAutoCheckableQualifications(scholarship);

  const [bookmarkResult, qualMatchItems, navContext] = await Promise.all([
    user
      ? supabase
          .from("bookmarks")
          .select("id")
          .eq("user_id", user.id)
          .eq("scholarship_id", scholarshipId)
          .maybeSingle()
          .then(({ data }) => data)
      : Promise.resolve(null),
    user && autoCheckApplicable
      ? getScholarshipQualMatch(supabase, user.id, scholarship)
      : Promise.resolve(null),
    resolveNavUserContext(user),
  ]);

  const initialBookmarked = !!bookmarkResult;

  const displayName = cleanScholarshipName(scholarship.name);
  const benefitHighlights = resolveScholarshipBenefits({
    supportTypes: scholarship.support_types,
    supportAmountText: scholarship.support_amount_text,
    isAdvertisement,
  });

  const autoCheck: AutoCheckState = !autoCheckApplicable
    ? { kind: "none" }
    : qualMatchItems
      ? { kind: "ready", items: qualMatchItems }
      : { kind: "guest", ctaHref: user ? "/onboarding" : "/auth" };

  const posterAlt = `${displayName} 포스터`;
  const organizationInitial = scholarship.organization?.charAt(0) || "장";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* 데스크톱만 검색 헤더 — 모바일은 에어비앤비식 풀블리드 히어로 */}
      <div className="hidden md:block">
        <HomeSearchRoot>
          <SpotifyTopNav
            variant="compact"
            currentUser={user}
            currentUserRole={navContext.role}
            currentUserName={navContext.name}
            urgentBookmarkCount={navContext.urgentBookmarkCount}
          />
        </HomeSearchRoot>
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

                <h1 className="mt-2 break-keep text-[1.65rem] font-extrabold leading-snug tracking-tight text-ink sm:text-[2rem]">
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

                {isAdvertisement && scholarship.ad_job_role && (
                  <div className="mt-6 border-t border-gray-100 pt-6 text-sm text-ink/80">
                    <span className="font-semibold text-ink">모집 직무</span> {scholarship.ad_job_role}
                  </div>
                )}

                <ScholarshipTabs
                  scholarship={scholarship}
                  selectionStages={selectionStages ?? []}
                  autoCheck={autoCheck}
                  layout="netflix"
                  preScheduleSlot={<BenefitHighlights benefits={benefitHighlights} />}
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

              {/* 데스크톱 사이드: 에어비앤비식 신청 박스 — 모바일은 히어로 + 하단 고정 바 */}
              <div className="h-0 w-full overflow-visible md:h-auto md:sticky md:top-20 md:order-2 md:self-start">
                <div className="md:rounded-2xl md:bg-white md:p-5 md:shadow-[0_6px_16px_rgba(0,0,0,0.12)]">
                  <div className="mb-0 hidden aspect-7/9 md:block">
                    {scholarship.poster_image_url ? (
                      <ScholarshipPoster
                        posterUrl={scholarship.poster_image_url}
                        alt={posterAlt}
                      />
                    ) : (
                      <div
                        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-linear-to-br ${posterPlaceholderGradient}`}
                      >
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
        </div>
      </main>
      <ViewCountIncrementer scholarshipId={scholarshipId} />
      <RecentViewTracker
        id={scholarshipId}
        name={displayName}
        organization={scholarship.organization ?? ""}
        posterImageUrl={scholarship.poster_image_url}
        applyEndDate={scholarship.apply_end_date}
        contentKind="scholarship"
      />

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
