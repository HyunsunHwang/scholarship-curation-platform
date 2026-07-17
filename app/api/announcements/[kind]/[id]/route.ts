import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPublicSupabaseClient } from "@/lib/public-data";
import {
  CONTEST_DETAIL_SELECT,
  SCHOLARSHIP_DETAIL_SELECT,
} from "@/lib/detail-select";
import {
  announcementHref,
  announcementKindLabel,
  contestToScholarshipDetail,
  isAnnouncementKind,
  scholarshipRowToDetail,
  type AnnouncementDetailPayload,
  type AnnouncementKind,
} from "@/lib/announcement-detail";
import {
  resolveContestBenefits,
  resolveScholarshipBenefits,
} from "@/lib/benefit-categories";
import { getContestScrapCounts, effectiveContestScrapCount } from "@/lib/contest-scrap-counts";
import { getScholarshipScrapCounts } from "@/lib/scholarship-scrap-counts";
import {
  getScholarshipQualMatch,
  hasAutoCheckableQualifications,
  type AutoCheckState,
} from "@/lib/scholarship-qualification-match";
import {
  interestCategoryLabel,
  isInterestCategoryId,
  type InterestCategoryId,
} from "@/lib/interestCategories";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import type { Contest, Database } from "@/lib/database.types";
import type { SelectionStageDetail } from "@/app/scholarships/[id]/ScholarshipTabs";

type ScholarshipRow = Database["public"]["Tables"]["scholarships"]["Row"];

export async function GET(
  _request: Request,
  context: { params: Promise<{ kind: string; id: string }> }
) {
  const { kind: rawKind, id: rawId } = await context.params;
  if (!isAnnouncementKind(rawKind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  const id = Number.parseInt(rawId, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const payload =
      rawKind === "scholarship"
        ? await fetchScholarshipPayload(id)
        : await fetchContestPayload(rawKind, id);
    if (!payload) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(payload);
  } catch (error) {
    console.error("announcement detail api failed", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

async function fetchContestPayload(
  kind: Exclude<AnnouncementKind, "scholarship">,
  id: number
): Promise<AnnouncementDetailPayload | null> {
  const publicClient = createPublicSupabaseClient();
  const authSupabase = await createClient();

  const [contestResult, { data: { user } }, { data: selectionStages }, scrapMap] =
    await Promise.all([
      publicClient
        .from("contests")
        .select(CONTEST_DETAIL_SELECT)
        .eq("id", id)
        .eq("is_verified", true)
        .eq("content_kind", kind)
        .maybeSingle(),
      authSupabase.auth.getUser(),
      publicClient
        .from("contest_selection_stages")
        .select("stage_order, title, phase, schedule_date, schedule_text, note")
        .eq("contest_id", id)
        .order("stage_order"),
      getContestScrapCounts(authSupabase, [id]),
    ]);

  if (contestResult.error || !contestResult.data) return null;
  const contest = contestResult.data as unknown as Contest;

  const bookmarkResult = user
    ? await authSupabase
        .from("contest_bookmarks")
        .select("id")
        .eq("user_id", user.id)
        .eq("contest_id", id)
        .maybeSingle()
        .then(({ data }) => data)
    : null;

  const interestLabels = (contest.interest_categories ?? [])
    .filter(isInterestCategoryId)
    .map((cid: InterestCategoryId) => interestCategoryLabel(cid));

  const detail = contestToScholarshipDetail(contest);
  const benefits = resolveContestBenefits({
    benefits: contest.benefits,
    supportAmountText: contest.support_amount_text,
    additionalNote: contest.note,
    contentKind: kind,
    name: contest.name,
    noticeText: contest.original_notice_text,
  });

  return {
    kind,
    id,
    href: announcementHref(kind, id),
    name: contest.name,
    organization: contest.organization ?? "",
    kindLabel: announcementKindLabel(kind),
    posterImageUrl: contest.poster_image_url,
    applyUrl: contest.apply_url,
    viewCount: contest.view_count ?? 0,
    scrapCount: effectiveContestScrapCount(
      contest.scrap_count,
      scrapMap.get(id) ?? 0
    ),
    initialBookmarked: !!bookmarkResult,
    interestLabels,
    benefits,
    scholarship: detail,
    selectionStages: (selectionStages ?? []) as SelectionStageDetail[],
    autoCheck: { kind: "none" },
    hideQualificationSections: true,
    contact: contest.contact,
    adJobRole: null,
  };
}

async function fetchScholarshipPayload(
  id: number
): Promise<AnnouncementDetailPayload | null> {
  const supabase = await createClient();
  const [
    scholarshipResult,
    { data: { user } },
    scrapMap,
    { data: selectionStages },
  ] = await Promise.all([
    supabase
      .from("scholarships")
      .select(SCHOLARSHIP_DETAIL_SELECT)
      .eq("id", id)
      .eq("is_verified", true)
      .maybeSingle(),
    supabase.auth.getUser(),
    getScholarshipScrapCounts(supabase, [id]),
    supabase
      .from("scholarship_selection_stages")
      .select("stage_order, title, phase, schedule_date, schedule_text, note")
      .eq("scholarship_id", id)
      .order("stage_order"),
  ]);

  if (scholarshipResult.error || !scholarshipResult.data) return null;
  const row = scholarshipResult.data as unknown as ScholarshipRow;
  const isAdvertisement = row.is_advertisement === true;
  const autoCheckApplicable =
    !isAdvertisement && hasAutoCheckableQualifications(row);

  const [bookmarkResult, qualMatchItems] = await Promise.all([
    user
      ? supabase
          .from("bookmarks")
          .select("id")
          .eq("user_id", user.id)
          .eq("scholarship_id", id)
          .maybeSingle()
          .then(({ data }) => data)
      : Promise.resolve(null),
    user && autoCheckApplicable
      ? getScholarshipQualMatch(supabase, user.id, row)
      : Promise.resolve(null),
  ]);

  const autoCheck: AutoCheckState = !autoCheckApplicable
    ? { kind: "none" }
    : qualMatchItems
      ? { kind: "ready", items: qualMatchItems }
      : { kind: "guest", ctaHref: user ? "/onboarding" : "/auth" };

  const detail = scholarshipRowToDetail(row);
  const name = cleanScholarshipName(row.name);

  return {
    kind: "scholarship",
    id,
    href: announcementHref("scholarship", id),
    name,
    organization: row.organization ?? "",
    kindLabel: isAdvertisement
      ? row.institution_type || "채용"
      : announcementKindLabel("scholarship"),
    posterImageUrl: row.poster_image_url,
    applyUrl: row.apply_url,
    viewCount: row.view_count ?? 0,
    scrapCount: scrapMap.get(id) ?? 0,
    initialBookmarked: !!bookmarkResult,
    interestLabels: [],
    benefits: resolveScholarshipBenefits({
      supportTypes: row.support_types,
      supportAmountText: row.support_amount_text,
      isAdvertisement,
    }),
    scholarship: detail,
    selectionStages: (selectionStages ?? []) as SelectionStageDetail[],
    autoCheck,
    hideQualificationSections: false,
    contact: isAdvertisement ? null : row.contact,
    adJobRole: isAdvertisement ? row.ad_job_role : null,
  };
}
