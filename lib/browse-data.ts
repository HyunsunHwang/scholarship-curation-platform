import type { CardScholarship } from "@/components/ScholarshipCard";
import { buildContestCardSupportFields, contestIdsNeedingNotice } from "@/lib/support-amount";
import type { ContentCategoryKey } from "@/lib/content-categories";
import { effectiveContestScrapCount } from "@/lib/contest-scrap-counts";
import { createPublicSupabaseClient } from "@/lib/public-data";
import { todayKoreaYYYYMMDD } from "@/lib/scholarship-dates";
import { isUniversitySpecificScholarship } from "@/lib/scholarship-university";
import {
  CONTEST_ORG_TYPES,
  EMPTY_BROWSE_FACETS,
  SCHOLARSHIP_ORG_TYPES,
  browseFacetsToSearchParams,
  escapeIlike,
  fieldCodesForInterestIds,
  hasBrowseFacets,
  parseBrowseFacets,
  rawBenefitTagsForIds,
  supportTypesForBenefitIds,
  type BrowseFacetFilters,
} from "@/lib/browse-facets";
import { expandInterestFilterIds } from "@/lib/interestCategories";
import { applyContestStudentAudienceFilter } from "@/lib/contest-audience";

export type BrowseSort = "latest" | "deadline" | "views" | "scraps";
export type BrowseKind = Exclude<ContentCategoryKey, "all"> | "all";
export type BrowseSection = "all" | "trending" | "internship" | "hiring";

export const BROWSE_SORT_OPTIONS: { key: BrowseSort; label: string }[] = [
  { key: "latest", label: "최신순" },
  { key: "deadline", label: "마감순" },
  { key: "views", label: "조회순" },
  { key: "scraps", label: "스크랩순" },
];

export const BROWSE_PAGE_SIZE = 24;

const CONTEST_KINDS = new Set(["contest", "education", "activity"]);

/** 링커리어·정리된 혜택 라벨 — 인턴 섹션 */
const INTERNSHIP_BENEFIT_TAGS = [
  "인턴쉽 기회",
  "인턴/정규직채용",
  "인턴십",
  "인턴",
];

/** 링커리어·정리된 혜택 라벨 — 채용 섹션 */
const HIRING_BENEFIT_TAGS = [
  "인턴/정규직채용",
  "입사시 혜택",
  "입사시 가산점",
  "채용연계",
  "입사혜택",
  "입사 가산점",
  "채용",
];

function isCareerSection(
  section: BrowseSection
): section is "internship" | "hiring" {
  return section === "internship" || section === "hiring";
}

function careerBenefitTags(section: "internship" | "hiring"): string[] {
  return section === "internship" ? INTERNSHIP_BENEFIT_TAGS : HIRING_BENEFIT_TAGS;
}
function parseBrowseKind(raw: string | null | undefined): BrowseKind {
  if (
    raw === "contest" ||
    raw === "education" ||
    raw === "activity" ||
    raw === "scholarship"
  ) {
    return raw;
  }
  return "all";
}

function parseBrowseSort(raw: string | null | undefined): BrowseSort {
  if (
    raw === "latest" ||
    raw === "deadline" ||
    raw === "views" ||
    raw === "scraps"
  ) {
    return raw;
  }
  return "deadline";
}

function parseBrowseSection(raw: string | null | undefined): BrowseSection {
  if (raw === "trending" || raw === "internship" || raw === "hiring") {
    return raw;
  }
  return "all";
}

export function parseBrowseParams(searchParams: {
  kind?: string;
  sort?: string;
  section?: string;
  page?: string;
  list?: string;
  interest?: string;
  benefit?: string;
  org?: string;
  q?: string;
}) {
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const kind = parseBrowseKind(searchParams.kind);
  const section = parseBrowseSection(searchParams.section);
  const facets = parseBrowseFacets({
    interest: searchParams.interest,
    benefit: searchParams.benefit,
    org: searchParams.org,
    q: searchParams.q,
  });
  const list =
    searchParams.list === "1" ||
    searchParams.list === "true" ||
    kind !== "all" ||
    section === "trending" ||
    isCareerSection(section) ||
    page > 1 ||
    hasBrowseFacets(facets);
  return {
    kind,
    sort: parseBrowseSort(searchParams.sort),
    section,
    page,
    facets,
    /** false면 탐색 허브(카테고리 그리드), true면 목록 */
    list,
  };
}

export function browseHref(opts: {
  kind?: BrowseKind;
  sort?: BrowseSort;
  section?: BrowseSection;
  page?: number;
  /** 전체 목록 — 탐색 허브를 건너뛰고 리스트로 */
  list?: boolean;
  facets?: BrowseFacetFilters;
}): string {
  const params = new URLSearchParams();
  if (opts.kind && opts.kind !== "all") params.set("kind", opts.kind);
  if (opts.sort && opts.sort !== "deadline") params.set("sort", opts.sort);
  if (
    opts.section === "trending" ||
    opts.section === "internship" ||
    opts.section === "hiring"
  ) {
    params.set("section", opts.section);
  }
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  const facetParams = browseFacetsToSearchParams(
    opts.facets ?? EMPTY_BROWSE_FACETS
  );
  for (const [key, value] of Object.entries(facetParams)) {
    params.set(key, value);
  }
  if (
    opts.list &&
    (!opts.kind || opts.kind === "all") &&
    opts.section !== "trending" &&
    !isCareerSection(opts.section ?? "all") &&
    !hasBrowseFacets(opts.facets ?? EMPTY_BROWSE_FACETS)
  ) {
    params.set("list", "1");
  }
  const q = params.toString();
  return q ? `/browse?${q}` : "/browse";
}

function applyContestFacetFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  facets: BrowseFacetFilters
) {
  if (facets.interests.length) {
    // 필터 칩은 대분류 → 세부 id로 펼쳐 공고 태그와 overlaps
    const jobIds = expandInterestFilterIds(facets.interests);
    if (jobIds.length) {
      query = query.overlaps("interest_categories", jobIds);
    }
  }
  if (facets.benefits.length) {
    const tags = rawBenefitTagsForIds(facets.benefits);
    if (tags.length) query = query.overlaps("benefits", tags);
  }
  const orgs = facets.orgs.filter((o) =>
    (CONTEST_ORG_TYPES as readonly string[]).includes(o)
  );
  if (orgs.length === 1) {
    query = query.eq("organization_type", orgs[0]);
  } else if (orgs.length > 1) {
    query = query.in("organization_type", orgs);
  }
  if (facets.q) {
    const safe = escapeIlike(facets.q);
    query = query.or(
      `name.ilike.%${safe}%,organization.ilike.%${safe}%`
    );
  }
  return query;
}

function applyScholarshipFacetFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  facets: BrowseFacetFilters
) {
  const fieldCodes = fieldCodesForInterestIds(facets.interests);
  if (fieldCodes.length) {
    query = query.overlaps("qual_field_codes", fieldCodes);
  }
  const supportTypes = supportTypesForBenefitIds(facets.benefits);
  if (supportTypes.length) {
    query = query.overlaps("support_types", supportTypes);
  }
  const orgs = facets.orgs.filter((o) =>
    (SCHOLARSHIP_ORG_TYPES as readonly string[]).includes(o)
  );
  if (orgs.length === 1) {
    query = query.eq("institution_type", orgs[0]);
  } else if (orgs.length > 1) {
    query = query.in("institution_type", orgs);
  }
  if (facets.q) {
    const safe = escapeIlike(facets.q);
    query = query.or(
      `name.ilike.%${safe}%,organization.ilike.%${safe}%`
    );
  }
  return query;
}

/** 탐색 허브 카테고리 타일 */
export type BrowseExploreTile = {
  key: string;
  label: string;
  href: string;
  color: string;
  coverUrl: string | null;
};

const EXPLORE_TILE_DEFS: Omit<BrowseExploreTile, "coverUrl">[] = [
  {
    key: "contest",
    label: "공모전",
    href: browseHref({ kind: "contest" }),
    color: "#DC148C",
  },
  {
    key: "education",
    label: "교육",
    href: browseHref({ kind: "education" }),
    color: "#14833B",
  },
  {
    key: "activity",
    label: "대외활동",
    href: browseHref({ kind: "activity" }),
    color: "#8D67AB",
  },
  {
    key: "scholarship",
    label: "장학금",
    href: browseHref({ kind: "scholarship" }),
    color: "#BA5D07",
  },
  {
    key: "internship",
    label: "인턴",
    href: browseHref({ section: "internship", sort: "deadline" }),
    color: "#0D7377",
  },
  {
    key: "hiring",
    label: "채용",
    href: browseHref({ section: "hiring", sort: "deadline" }),
    color: "#1E3264",
  },
];

async function fetchOnePoster(opts: {
  table: "contests" | "scholarships";
  contentKind?: "contest" | "education" | "activity";
  benefitTags?: string[];
  advertisementsOnly?: boolean;
}): Promise<string | null> {
  const supabase = createPublicSupabaseClient();
  const today = todayKoreaYYYYMMDD();

  if (opts.table === "contests") {
    let query = supabase
      .from("contests")
      .select("poster_image_url")
      .eq("is_verified", true)
      .eq("list_on_home", true)
      .gte("apply_end_date", today)
      .not("poster_image_url", "is", null)
      .order("view_count", { ascending: false, nullsFirst: false })
      .limit(1);
    if (opts.contentKind) {
      query = query.eq("content_kind", opts.contentKind);
    }
    if (opts.benefitTags?.length) {
      query = query.overlaps("benefits", opts.benefitTags);
    }
    query = applyContestStudentAudienceFilter(query);
    const { data } = await query;
    return data?.[0]?.poster_image_url ?? null;
  }

  let query = supabase
    .from("scholarships")
    .select("poster_image_url")
    .eq("is_verified", true)
    .eq("list_on_home", true)
    .gte("apply_end_date", today)
    .not("poster_image_url", "is", null)
    .order("view_count", { ascending: false, nullsFirst: false })
    .limit(1);
  if (opts.advertisementsOnly) {
    query = query.eq("is_advertisement", true);
  }
  const { data } = await query;
  return data?.[0]?.poster_image_url ?? null;
}

export async function fetchBrowseExploreTiles(): Promise<BrowseExploreTile[]> {
  const [contest, education, activity, scholarship, internship, hiring] =
    await Promise.all([
      fetchOnePoster({ table: "contests", contentKind: "contest" }),
      fetchOnePoster({ table: "contests", contentKind: "education" }),
      fetchOnePoster({ table: "contests", contentKind: "activity" }),
      fetchOnePoster({ table: "scholarships" }),
      fetchOnePoster({
        table: "contests",
        benefitTags: INTERNSHIP_BENEFIT_TAGS,
      }),
      fetchOnePoster({
        table: "contests",
        benefitTags: HIRING_BENEFIT_TAGS,
      }).then(
        async (url) =>
          url ??
          (await fetchOnePoster({
            table: "scholarships",
            advertisementsOnly: true,
          }))
      ),
    ]);

  const covers: Record<string, string | null> = {
    contest,
    education,
    activity,
    scholarship,
    internship: internship ?? activity ?? contest,
    hiring: hiring ?? scholarship ?? contest,
  };

  return EXPLORE_TILE_DEFS.map((tile) => ({
    ...tile,
    coverUrl: covers[tile.key] ?? null,
  }));
}

type ScrapCountRow = { scholarship_id: number; scrap_count: number | string };
type ContestScrapCountRow = { contest_id: number; scrap_count: number | string };

async function scrapCountMap(ids: number[]) {
  const unique = Array.from(new Set(ids));
  const map = new Map<number, number>();
  if (unique.length === 0) return map;
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase.rpc("get_scholarship_scrap_counts", {
    p_scholarship_ids: unique,
  });
  if (error) {
    console.error("browse scrap counts failed", error);
    return map;
  }
  for (const row of (data ?? []) as ScrapCountRow[]) {
    map.set(row.scholarship_id, Number(row.scrap_count) || 0);
  }
  return map;
}

async function contestScrapCountMap(ids: number[]) {
  const unique = Array.from(new Set(ids));
  const map = new Map<number, number>();
  if (unique.length === 0) return map;
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase.rpc("get_contest_scrap_counts", {
    p_contest_ids: unique,
  });
  if (error) {
    console.error("browse contest scrap counts failed", error);
    return map;
  }
  for (const row of (data ?? []) as ContestScrapCountRow[]) {
    map.set(row.contest_id, Number(row.scrap_count) || 0);
  }
  return map;
}

function contestOrderColumn(sort: BrowseSort): { column: string; ascending: boolean } {
  switch (sort) {
    case "latest":
      return { column: "created_at", ascending: false };
    case "views":
    case "scraps":
      return { column: "view_count", ascending: false };
    case "deadline":
    default:
      return { column: "apply_end_date", ascending: true };
  }
}

function scholarshipOrderColumn(sort: BrowseSort): {
  column: string;
  ascending: boolean;
} {
  switch (sort) {
    case "latest":
      return { column: "created_at", ascending: false };
    case "views":
    case "scraps":
      return { column: "view_count", ascending: false };
    case "deadline":
    default:
      return { column: "apply_end_date", ascending: true };
  }
}

function mapContestRow(
  contest: {
    id: number;
    name: string;
    organization: string;
    organization_type: string | null;
    support_amount_text: string | null;
    benefits?: string[] | null;
    note?: string | null;
    original_notice_text?: string | null;
    apply_end_date: string | null;
    poster_image_url: string | null;
    created_at: string;
    view_count: number | null;
    scrap_count?: number | null;
    is_recommended: boolean;
    recommended_sort_order: number | null;
    content_kind: string | null;
  },
  today: string,
  bookmarkScrapCount = 0,
  noticeText: string | null = null
): CardScholarship {
  const kind = (contest.content_kind ?? "contest") as
    | "contest"
    | "education"
    | "activity";
  const supportFields = buildContestCardSupportFields({
    name: contest.name,
    contentKind: kind,
    supportAmountText: contest.support_amount_text,
    benefits: contest.benefits,
    additionalNote: contest.note,
    originalNoticeText: noticeText ?? contest.original_notice_text ?? null,
  });
  return {
    id: contest.id,
    name: contest.name,
    organization: contest.organization,
    institution_type: contest.organization_type || "기타",
    support_types: [],
    support_amount_text: contest.support_amount_text,
    benefits: contest.benefits ?? null,
    benefit_note: contest.note ?? null,
    benefit_notice_text: supportFields.benefit_notice_text,
    card_support_line: supportFields.card_support_line,
    apply_end_date: contest.apply_end_date ?? today,
    poster_image_url: contest.poster_image_url,
    created_at: contest.created_at,
    view_count: contest.view_count,
    scrap_count: effectiveContestScrapCount(
      contest.scrap_count,
      bookmarkScrapCount
    ),
    is_recommended: contest.is_recommended,
    recommended_sort_order: contest.recommended_sort_order,
    is_advertisement: false,
    content_kind: kind,
  };
}

async function loadContestNoticesById(
  rows: ReadonlyArray<{
    id: number;
    support_amount_text?: string | null;
    benefits?: string[] | null;
    note?: string | null;
  }>
): Promise<Map<number, string | null>> {
  const noticeById = new Map<number, string | null>();
  const noticeIds = contestIdsNeedingNotice(rows);
  if (noticeIds.length === 0) return noticeById;
  const supabase = createPublicSupabaseClient();
  const { data } = await supabase
    .from("contests")
    .select("id, original_notice_text")
    .in("id", noticeIds);
  for (const row of data ?? []) {
    noticeById.set(row.id, row.original_notice_text);
  }
  return noticeById;
}

async function fetchContestPage(opts: {
  kind: "contest" | "education" | "activity";
  sort: BrowseSort;
  section: BrowseSection;
  page: number;
  pageSize: number;
  facets?: BrowseFacetFilters;
}): Promise<{ items: CardScholarship[]; totalCount: number; hasMore: boolean }> {
  const supabase = createPublicSupabaseClient();
  const today = todayKoreaYYYYMMDD();
  const from = (opts.page - 1) * opts.pageSize;
  const to = from + opts.pageSize - 1;
  const order = contestOrderColumn(opts.sort);
  const facets = opts.facets ?? EMPTY_BROWSE_FACETS;

  let query = supabase
    .from("contests")
    .select(
      "id, name, organization, organization_type, support_amount_text, benefits, note, apply_end_date, poster_image_url, created_at, view_count, scrap_count, is_recommended, recommended_sort_order, content_kind",
      { count: "exact" }
    )
    .eq("is_verified", true)
    .eq("list_on_home", true)
    .eq("content_kind", opts.kind)
    .gte("apply_end_date", today);

  if (isCareerSection(opts.section)) {
    query = query.overlaps("benefits", careerBenefitTags(opts.section));
  }

  query = applyContestStudentAudienceFilter(query);
  query = applyContestFacetFilters(query, facets);

  if (opts.section === "trending") {
    query = query
      .order("view_count", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    query = query
      .order(order.column, { ascending: order.ascending, nullsFirst: false })
      .order("id", { ascending: false });
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    console.error("browse contests failed", error);
    return { items: [], totalCount: 0, hasMore: false };
  }

  const rows = data ?? [];
  const [scrapCounts, noticeById] = await Promise.all([
    contestScrapCountMap(rows.map((row) => row.id)),
    loadContestNoticesById(rows),
  ]);
  let items = rows.map((row) =>
    mapContestRow(
      row,
      today,
      scrapCounts.get(row.id) ?? 0,
      noticeById.get(row.id) ?? null
    )
  );

  if (opts.sort === "scraps" || opts.section === "trending") {
    items = [...items].sort((a, b) => {
      const scrapDiff = (b.scrap_count ?? 0) - (a.scrap_count ?? 0);
      if (scrapDiff !== 0) return scrapDiff;
      return (b.view_count ?? 0) - (a.view_count ?? 0);
    });
  }

  const totalCount = count ?? items.length;
  return {
    items,
    totalCount,
    hasMore: from + items.length < totalCount,
  };
}

async function fetchScholarshipPage(opts: {
  sort: BrowseSort;
  section: BrowseSection;
  page: number;
  pageSize: number;
  facets?: BrowseFacetFilters;
}): Promise<{ items: CardScholarship[]; totalCount: number; hasMore: boolean }> {
  const supabase = createPublicSupabaseClient();
  const today = todayKoreaYYYYMMDD();
  const from = (opts.page - 1) * opts.pageSize;
  const to = from + opts.pageSize - 1;
  const order = scholarshipOrderColumn(opts.sort);
  const facets = opts.facets ?? EMPTY_BROWSE_FACETS;

  // 교내 전용 필터를 위해 여유분 조회 후 슬라이스
  const overscan = 3;
  const fetchFrom = from;
  const fetchTo = to + opts.pageSize * (overscan - 1);

  let query = supabase
    .from("scholarships")
    .select(
      "id, name, organization, qual_university, institution_type, support_types, support_amount_text, apply_end_date, poster_image_url, created_at, view_count, is_recommended, recommended_sort_order, is_advertisement",
      { count: "exact" }
    )
    .eq("is_verified", true)
    .eq("list_on_home", true)
    .gte("apply_end_date", today);

  // 인턴 섹션: 장학금은 제외 / 채용 섹션: 광고(채용) 공고만
  if (opts.section === "internship") {
    return { items: [], totalCount: 0, hasMore: false };
  }
  if (opts.section === "hiring") {
    query = query.eq("is_advertisement", true);
  }

  // 참여대상은 contests 전용 — 장학금 목록에서는 무시
  query = applyScholarshipFacetFilters(query, facets);

  if (opts.section === "trending") {
    query = query
      .order("view_count", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    query = query
      .order(order.column, { ascending: order.ascending, nullsFirst: false })
      .order("id", { ascending: false });
  }

  const [{ data, error, count }, universityNames] = await Promise.all([
    query.range(fetchFrom, fetchTo),
    import("@/lib/public-data").then((m) => m.getCachedUniversityNames()),
  ]);

  if (error) {
    console.error("browse scholarships failed", error);
    return { items: [], totalCount: 0, hasMore: false };
  }

  const filtered = (data ?? []).filter(
    (s) => !isUniversitySpecificScholarship(s, universityNames)
  );

  const pageSlice = filtered.slice(0, opts.pageSize);
  const scrapCounts = await scrapCountMap(pageSlice.map((s) => s.id));

  let items: CardScholarship[] = pageSlice.map((s) => ({
    id: s.id,
    name: s.name,
    organization: s.organization,
    institution_type: s.institution_type,
    support_types: s.support_types as string[],
    support_amount_text: s.support_amount_text,
    apply_end_date: s.apply_end_date,
    poster_image_url: s.poster_image_url,
    created_at: s.created_at,
    view_count: s.view_count,
    scrap_count: scrapCounts.get(s.id) ?? 0,
    is_recommended: s.is_recommended,
    recommended_sort_order: s.recommended_sort_order,
    is_advertisement: s.is_advertisement,
    content_kind: "scholarship" as const,
  }));

  if (opts.sort === "scraps" || opts.section === "trending") {
    items = [...items].sort((a, b) => {
      const scrapDiff = (b.scrap_count ?? 0) - (a.scrap_count ?? 0);
      if (scrapDiff !== 0) return scrapDiff;
      return (b.view_count ?? 0) - (a.view_count ?? 0);
    });
  }

  // count는 교내 필터 전 값이므로 근사치. hasMore는 가져온 양으로 판단
  const totalCount = count ?? items.length;
  const hasMore = filtered.length > opts.pageSize || fetchTo + 1 < totalCount;

  return { items, totalCount, hasMore };
}

/**
 * kind=all 일 때: 페이지마다 contests/scholarships를 번갈아 합치지 않고
 * 각 소스에서 pageSize/2씩 가져와 정렬 키로 머지한다.
 */
async function fetchAllKindsPage(opts: {
  sort: BrowseSort;
  section: BrowseSection;
  page: number;
  pageSize: number;
  facets?: BrowseFacetFilters;
}): Promise<{ items: CardScholarship[]; totalCount: number; hasMore: boolean }> {
  const half = Math.max(8, Math.ceil(opts.pageSize / 2));
  const facets = opts.facets ?? EMPTY_BROWSE_FACETS;
  const [contestRes, eduRes, actRes, scholRes] = await Promise.all([
    fetchContestPage({
      kind: "contest",
      sort: opts.sort,
      section: opts.section,
      page: opts.page,
      pageSize: half,
      facets,
    }),
    fetchContestPage({
      kind: "education",
      sort: opts.sort,
      section: opts.section,
      page: opts.page,
      pageSize: half,
      facets,
    }),
    fetchContestPage({
      kind: "activity",
      sort: opts.sort,
      section: opts.section,
      page: opts.page,
      pageSize: half,
      facets,
    }),
    fetchScholarshipPage({
      sort: opts.sort,
      section: opts.section,
      page: opts.page,
      pageSize: half,
      facets,
    }),
  ]);

  const merged = [
    ...contestRes.items,
    ...eduRes.items,
    ...actRes.items,
    ...scholRes.items,
  ];

  merged.sort((a, b) => {
    if (opts.section === "trending" || opts.sort === "scraps") {
      const scrapDiff = (b.scrap_count ?? 0) - (a.scrap_count ?? 0);
      if (scrapDiff !== 0) return scrapDiff;
      return (b.view_count ?? 0) - (a.view_count ?? 0);
    }
    if (opts.sort === "views") {
      return (b.view_count ?? 0) - (a.view_count ?? 0);
    }
    if (opts.sort === "latest") {
      return (b.created_at || "").localeCompare(a.created_at || "");
    }
    // deadline
    return (a.apply_end_date || "").localeCompare(b.apply_end_date || "");
  });

  const items = merged.slice(0, opts.pageSize);
  const totalCount =
    contestRes.totalCount +
    eduRes.totalCount +
    actRes.totalCount +
    scholRes.totalCount;
  const hasMore =
    contestRes.hasMore ||
    eduRes.hasMore ||
    actRes.hasMore ||
    scholRes.hasMore;

  return { items, totalCount, hasMore };
}

/**
 * 탐색 허브 인턴/채용: content_kind 구분 없이 혜택 태그로 contests를 모은다.
 * 채용은 장학금 광고(채용) 공고도 포함한다.
 */
async function fetchCareerBrowsePage(opts: {
  career: "internship" | "hiring";
  sort: BrowseSort;
  page: number;
  pageSize: number;
  facets?: BrowseFacetFilters;
}): Promise<{ items: CardScholarship[]; totalCount: number; hasMore: boolean }> {
  const supabase = createPublicSupabaseClient();
  const today = todayKoreaYYYYMMDD();
  const from = (opts.page - 1) * opts.pageSize;
  const to = from + opts.pageSize - 1;
  const order = contestOrderColumn(opts.sort);
  const tags = careerBenefitTags(opts.career);
  const facets = opts.facets ?? EMPTY_BROWSE_FACETS;

  let contestQuery = supabase
    .from("contests")
    .select(
      "id, name, organization, organization_type, support_amount_text, benefits, note, apply_end_date, poster_image_url, created_at, view_count, scrap_count, is_recommended, recommended_sort_order, content_kind",
      { count: "exact" }
    )
    .eq("is_verified", true)
    .eq("list_on_home", true)
    .gte("apply_end_date", today)
    .overlaps("benefits", tags);

  contestQuery = applyContestStudentAudienceFilter(contestQuery);
  contestQuery = applyContestFacetFilters(contestQuery, facets);

  contestQuery = contestQuery
    .order(order.column, { ascending: order.ascending, nullsFirst: false })
    .order("id", { ascending: false })
    .range(from, to);

  const { data: contestData, error: contestError, count: contestCount } =
    await contestQuery;

  if (contestError) {
    console.error("browse career contests failed", contestError);
  }

  const contestRows = contestData ?? [];
  const [scrapCounts, noticeById] = await Promise.all([
    contestScrapCountMap(contestRows.map((row) => row.id)),
    loadContestNoticesById(contestRows),
  ]);
  let items = contestRows.map((row) =>
    mapContestRow(
      row,
      today,
      scrapCounts.get(row.id) ?? 0,
      noticeById.get(row.id) ?? null
    )
  );

  let totalCount = contestCount ?? items.length;
  let hasMore = from + contestRows.length < totalCount;

  if (opts.career === "hiring") {
    const schol = await fetchScholarshipPage({
      sort: opts.sort,
      section: "hiring",
      page: opts.page,
      pageSize: opts.pageSize,
      facets,
    });
    items = [...items, ...schol.items];
    totalCount += schol.totalCount;
    hasMore = hasMore || schol.hasMore;
    items.sort((a, b) => {
      if (opts.sort === "views" || opts.sort === "scraps") {
        const scrapDiff = (b.scrap_count ?? 0) - (a.scrap_count ?? 0);
        if (scrapDiff !== 0) return scrapDiff;
        return (b.view_count ?? 0) - (a.view_count ?? 0);
      }
      if (opts.sort === "latest") {
        return (b.created_at || "").localeCompare(a.created_at || "");
      }
      return (a.apply_end_date || "").localeCompare(b.apply_end_date || "");
    });
    items = items.slice(0, opts.pageSize);
  }

  return { items, totalCount, hasMore };
}

export async function fetchBrowsePage(opts: {
  kind: BrowseKind;
  sort: BrowseSort;
  section: BrowseSection;
  page: number;
  pageSize?: number;
  facets?: BrowseFacetFilters;
}): Promise<{
  items: CardScholarship[];
  totalCount: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const pageSize = opts.pageSize ?? BROWSE_PAGE_SIZE;
  const page = Math.max(1, opts.page);
  const facets = opts.facets ?? EMPTY_BROWSE_FACETS;

  const withPages = (result: {
    items: CardScholarship[];
    totalCount: number;
    hasMore: boolean;
  }) => {
    const totalPages = Math.max(1, Math.ceil(result.totalCount / pageSize));
    return { ...result, page, pageSize, totalPages };
  };

  if (isCareerSection(opts.section) && opts.kind === "all") {
    return withPages(
      await fetchCareerBrowsePage({
        career: opts.section,
        sort: opts.sort,
        page,
        pageSize,
        facets,
      })
    );
  }

  if (opts.kind === "all") {
    return withPages(
      await fetchAllKindsPage({
        sort: opts.sort,
        section: opts.section,
        page,
        pageSize,
        facets,
      })
    );
  }

  if (CONTEST_KINDS.has(opts.kind)) {
    return withPages(
      await fetchContestPage({
        kind: opts.kind as "contest" | "education" | "activity",
        sort: opts.sort,
        section: opts.section,
        page,
        pageSize,
        facets,
      })
    );
  }

  return withPages(
    await fetchScholarshipPage({
      sort: opts.sort,
      section: opts.section,
      page,
      pageSize,
      facets,
    })
  );
}

export function browsePageTitle(kind: BrowseKind, section: BrowseSection): string {
  if (section === "internship") return "인턴";
  if (section === "hiring") return "채용";

  const kindLabel =
    kind === "all"
      ? "전체 공고"
      : kind === "contest"
        ? "공모전"
        : kind === "education"
          ? "교육"
          : kind === "activity"
            ? "대외활동"
            : "장학금";
  if (section === "trending") return `인기 상승 · ${kindLabel}`;
  return kindLabel;
}

/** 탐색 목록 상단 순위 배너용 — 스크랩·조회 기준 TOP 10 */
export async function fetchBrowseTopRank(opts: {
  kind: BrowseKind;
  section: BrowseSection;
  facets?: BrowseFacetFilters;
}): Promise<CardScholarship[]> {
  const isCareer = isCareerSection(opts.section);
  const { items } = await fetchBrowsePage({
    kind: opts.kind,
    sort: "scraps",
    section: isCareer ? opts.section : "trending",
    page: 1,
    pageSize: 10,
    facets: opts.facets,
  });
  return items.slice(0, 10);
}
