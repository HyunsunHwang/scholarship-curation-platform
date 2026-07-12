import { notFound } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import SpotifyTopNav from "@/components/home/SpotifyTopNav";
import HomeSearchRoot from "@/components/home/HomeSearchRoot";
import { createClient } from "@/lib/supabase/server";
import { createPublicSupabaseClient } from "@/lib/public-data";
import BookmarkApplyButtons from "@/app/scholarships/[id]/BookmarkApplyButtons";
import ScholarshipDetailHero from "@/app/scholarships/[id]/ScholarshipDetailHero";
import ScholarshipPoster from "@/app/scholarships/[id]/ScholarshipPoster";
import type {
  ScholarshipDetail,
  SelectionStageDetail,
} from "@/app/scholarships/[id]/ScholarshipTabs";
import { contentKindLabel } from "@/lib/content-categories";
import { resolveContestBenefits } from "@/lib/benefit-categories";
import BenefitHighlights from "@/components/BenefitHighlights";
import RecentViewTracker from "@/components/RecentViewTracker";
import {
  interestCategoryLabel,
  isInterestCategoryId,
  type InterestCategoryId,
} from "@/lib/interestCategories";
import type { Contest } from "@/lib/database.types";
import type { AutoCheckState } from "@/lib/scholarship-qualification-match";
import { CONTEST_DETAIL_SELECT } from "@/lib/detail-select";
import { resolveNavUserContext } from "@/lib/nav-user-context";

const ScholarshipTabs = dynamic(
  () => import("@/app/scholarships/[id]/ScholarshipTabs"),
  {
    loading: () => (
      <div className="mt-8 space-y-4" aria-hidden>
        <div className="h-8 w-40 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-24 w-full animate-pulse rounded-xl bg-gray-100" />
        <div className="h-24 w-full animate-pulse rounded-xl bg-gray-100" />
      </div>
    ),
  }
);
const posterPlaceholderGradient = "from-sky-400 to-sky-700";

type OpportunityKind = "contest" | "education" | "activity";

type ContactChannel = { icon: "mail" | "phone" | "info"; text: string; href: string | null };

function splitContactChannels(raw: string): ContactChannel[] {
  return raw
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const email = part.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
      if (email) return { icon: "mail" as const, text: part, href: `mailto:${email}` };
      const phone = part.match(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{3,4}/)?.[0];
      if (phone) {
        return {
          icon: "phone" as const,
          text: part,
          href: `tel:${phone.replace(/[.\s]/g, "-")}`,
        };
      }
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

function contestToScholarshipDetail(contest: Contest): ScholarshipDetail {
  return {
    id: contest.id,
    name: contest.name,
    organization: contest.organization,
    institution_type: contest.organization_type || "기타",
    apply_url: contest.apply_url,
    homepage_url: contest.homepage_url,
    support_types: [],
    apply_start_date: contest.apply_start_date,
    apply_end_date: contest.apply_end_date || "2099-12-31",
    selection_count: contest.selection_count,
    announcement_date: contest.announcement_date,
    can_overlap: null,
    qual_gpa_min: null,
    qual_gpa_last_semester_min: null,
    qual_last_semester_earned_credits_min: null,
    qual_income_level_max: null,
    qual_income_level_min: null,
    qual_household_size_max: null,
    qual_gender: null,
    qual_age_min: null,
    qual_age_max: null,
    qual_region: null,
    qual_major: null,
    qual_special_info: null,
    qual_extra_requirements: null,
    qual_parent_occupation: null,
    qual_military_status: null,
    qual_nationality: null,
    qual_admission_type: null,
    qual_parent_cohabitation: null,
    qual_parent_region: null,
    qual_university: null,
    qual_enrollment_status: null,
    qual_school_location: null,
    qual_school_category: null,
    qual_academic_year: null,
    apply_method: contest.apply_method,
    required_documents: contest.required_documents,
    document_files: contest.document_files ?? [],
    contact: contest.contact,
    selection_note: contest.selection_note,
    original_notice_image_url: contest.original_notice_image_url,
    original_notice_image_urls: contest.original_notice_image_urls,
    original_notice_text: contest.original_notice_text,
    note: contest.note,
    is_advertisement: false,
    ad_job_role: null,
    ad_required_skills: null,
    ad_location: null,
  };
}

export default async function OpportunityDetailPage({
  params,
  expectedKind,
}: {
  params: Promise<{ id: string }>;
  expectedKind?: OpportunityKind;
}) {
  const { id: rawId } = await params;
  const contestId = parseInt(rawId, 10);
  if (Number.isNaN(contestId)) notFound();

  const publicClient = createPublicSupabaseClient();
  const authSupabase = await createClient();

  let contestQuery = publicClient
    .from("contests")
    .select(CONTEST_DETAIL_SELECT)
    .eq("id", contestId)
    .eq("is_verified", true);
  if (expectedKind) contestQuery = contestQuery.eq("content_kind", expectedKind);

  const [contestResult, { data: { user } }, { data: selectionStages }] =
    await Promise.all([
      contestQuery.maybeSingle(),
      authSupabase.auth.getUser(),
      publicClient
        .from("contest_selection_stages")
        .select("stage_order, title, phase, schedule_date, schedule_text, note")
        .eq("contest_id", contestId)
        .order("stage_order"),
    ]);

  if (contestResult.error || !contestResult.data) notFound();

  const contest = contestResult.data as unknown as Contest;
  const navContext = await resolveNavUserContext(user);

  const kind = (contest.content_kind ?? "contest") as OpportunityKind;
  const kindLabel = contentKindLabel(kind);
  const displayName = contest.name;
  const posterAlt = `${displayName} 포스터`;
  const organizationInitial = contest.organization?.charAt(0) || kindLabel.charAt(0);
  const currentViewCount = contest.view_count ?? 0;
  const benefitHighlights = resolveContestBenefits({
    benefits: contest.benefits,
    supportAmountText: contest.support_amount_text,
    additionalNote: contest.note,
    contentKind: kind,
    name: contest.name,
    noticeText: contest.original_notice_text,
  });

  const interestLabels = (contest.interest_categories ?? [])
    .filter(isInterestCategoryId)
    .map((cid: InterestCategoryId) => interestCategoryLabel(cid));

  const detail = contestToScholarshipDetail(contest);
  const stages = (selectionStages ?? []) as SelectionStageDetail[];
  const autoCheck: AutoCheckState = { kind: "none" };

  return (
    <div className="flex min-h-screen flex-col bg-white">
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
        <div className="md:hidden">
          <ScholarshipDetailHero
            scholarshipId={contestId}
            posterUrl={contest.poster_image_url}
            alt={posterAlt}
            title={displayName}
            organizationInitial={organizationInitial}
            initialBookmarked={false}
            showBookmark={false}
          />
        </div>

        <div className="relative mx-auto w-full max-w-6xl pb-28 md:px-6 md:py-8 md:pb-8 lg:px-8">
          <div className="relative z-10 -mt-5 rounded-t-[1.75rem] bg-white px-4 pt-5 sm:px-6 md:mt-0 md:rounded-none md:px-0 md:pt-0">
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

              <div className="flex w-full min-w-0 items-center gap-3 text-xs text-ink/40 md:w-auto md:justify-end">
                <span className="inline-flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z" />
                    <circle cx="12" cy="12" r="2.25" />
                  </svg>
                  {currentViewCount.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="grid w-full grid-cols-1 items-start gap-0 md:grid-cols-[1fr_260px] md:gap-10">
              <div className="w-full min-w-0 overflow-x-hidden md:order-1">
                {interestLabels.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {interestLabels.map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center rounded-full border border-brand/25 bg-brand/5 px-2.5 py-0.5 text-[11px] font-semibold text-brand"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}

                <p className="text-xs font-medium tracking-wide text-ink/45">
                  {kindLabel}
                  {contest.organization ? ` · ${contest.organization}` : null}
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
                </div>

                <BenefitHighlights benefits={benefitHighlights} />

                <ScholarshipTabs
                  scholarship={detail}
                  selectionStages={stages}
                  autoCheck={autoCheck}
                  hideQualificationSections
                />

                {contest.contact && (
                  <div className="mt-8 border-t border-gray-100 pt-6">
                    <p className="text-xs font-semibold text-ink/40">문의</p>
                    <div className="mt-2 flex flex-col gap-1.5 text-sm">
                      {splitContactChannels(contest.contact).map((channel, i) => (
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

              <div className="h-0 w-full overflow-visible md:h-auto md:sticky md:top-20 md:order-2 md:self-start">
                <div className="md:rounded-2xl md:bg-white md:p-5 md:shadow-[0_6px_16px_rgba(0,0,0,0.12)]">
                  <div className="mb-0 hidden aspect-7/9 md:block">
                    {contest.poster_image_url ? (
                      <ScholarshipPoster
                        posterUrl={contest.poster_image_url}
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
                    scholarshipId={contest.id}
                    applyUrl={contest.apply_url}
                    initialBookmarked={false}
                    showBookmark={false}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <RecentViewTracker
        id={contestId}
        name={displayName}
        organization={contest.organization ?? ""}
        posterImageUrl={contest.poster_image_url}
        applyEndDate={contest.apply_end_date || "2099-12-31"}
        contentKind={kind}
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
