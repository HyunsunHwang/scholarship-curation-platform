import type { CardScholarship } from "@/components/ScholarshipCard";
import type { ContentCategoryKey } from "@/lib/content-categories";
import { createPublicSupabaseClient } from "@/lib/public-data";
import { todayKoreaYYYYMMDD } from "@/lib/scholarship-dates";
import { isUniversitySpecificScholarship } from "@/lib/scholarship-university";

export type BrowseSort = "latest" | "deadline" | "views" | "scraps";
export type BrowseKind = Exclude<ContentCategoryKey, "all"> | "all";
export type BrowseSection = "all" | "trending";

export const BROWSE_SORT_OPTIONS: { key: BrowseSort; label: string }[] = [
  { key: "latest", label: "최신순" },
  { key: "deadline", label: "마감순" },
  { key: "views", label: "조회순" },
  { key: "scraps", label: "스크랩순" },
];

export const BROWSE_PAGE_SIZE = 24;

const CONTEST_KINDS = new Set(["contest", "education", "activity"]);

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
  return raw === "trending" ? "trending" : "all";
}

export function parseBrowseParams(searchParams: {
  kind?: string;
  sort?: string;
  section?: string;
  page?: string;
}) {
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  return {
    kind: parseBrowseKind(searchParams.kind),
    sort: parseBrowseSort(searchParams.sort),
    section: parseBrowseSection(searchParams.section),
    page,
  };
}

export function browseHref(opts: {
  kind?: BrowseKind;
  sort?: BrowseSort;
  section?: BrowseSection;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (opts.kind && opts.kind !== "all") params.set("kind", opts.kind);
  if (opts.sort && opts.sort !== "deadline") params.set("sort", opts.sort);
  if (opts.section === "trending") params.set("section", "trending");
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  const q = params.toString();
  return q ? `/browse?${q}` : "/browse";
}

type ScrapCountRow = { scholarship_id: number; scrap_count: number | string };

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
    apply_end_date: string | null;
    poster_image_url: string | null;
    created_at: string;
    view_count: number | null;
    is_recommended: boolean;
    recommended_sort_order: number | null;
    content_kind: string | null;
  },
  today: string
): CardScholarship {
  return {
    id: contest.id,
    name: contest.name,
    organization: contest.organization,
    institution_type: contest.organization_type || "기타",
    support_types: [],
    support_amount_text: contest.support_amount_text,
    apply_end_date: contest.apply_end_date ?? today,
    poster_image_url: contest.poster_image_url,
    created_at: contest.created_at,
    view_count: contest.view_count,
    scrap_count: 0,
    is_recommended: contest.is_recommended,
    recommended_sort_order: contest.recommended_sort_order,
    is_advertisement: false,
    content_kind: (contest.content_kind ?? "contest") as
      | "contest"
      | "education"
      | "activity",
  };
}

async function fetchContestPage(opts: {
  kind: "contest" | "education" | "activity";
  sort: BrowseSort;
  section: BrowseSection;
  page: number;
  pageSize: number;
}): Promise<{ items: CardScholarship[]; totalCount: number; hasMore: boolean }> {
  const supabase = createPublicSupabaseClient();
  const today = todayKoreaYYYYMMDD();
  const from = (opts.page - 1) * opts.pageSize;
  const to = from + opts.pageSize - 1;
  const order = contestOrderColumn(opts.sort);

  let query = supabase
    .from("contests")
    .select(
      "id, name, organization, organization_type, support_amount_text, apply_end_date, poster_image_url, created_at, view_count, is_recommended, recommended_sort_order, content_kind",
      { count: "exact" }
    )
    .eq("is_verified", true)
    .eq("list_on_home", true)
    .eq("content_kind", opts.kind)
    .gte("apply_end_date", today);

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

  const items = (data ?? []).map((row) => mapContestRow(row, today));
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
}): Promise<{ items: CardScholarship[]; totalCount: number; hasMore: boolean }> {
  const supabase = createPublicSupabaseClient();
  const today = todayKoreaYYYYMMDD();
  const from = (opts.page - 1) * opts.pageSize;
  const to = from + opts.pageSize - 1;
  const order = scholarshipOrderColumn(opts.sort);

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
}): Promise<{ items: CardScholarship[]; totalCount: number; hasMore: boolean }> {
  const half = Math.max(8, Math.ceil(opts.pageSize / 2));
  const [contestRes, eduRes, actRes, scholRes] = await Promise.all([
    fetchContestPage({
      kind: "contest",
      sort: opts.sort,
      section: opts.section,
      page: opts.page,
      pageSize: half,
    }),
    fetchContestPage({
      kind: "education",
      sort: opts.sort,
      section: opts.section,
      page: opts.page,
      pageSize: half,
    }),
    fetchContestPage({
      kind: "activity",
      sort: opts.sort,
      section: opts.section,
      page: opts.page,
      pageSize: half,
    }),
    fetchScholarshipPage({
      sort: opts.sort,
      section: opts.section,
      page: opts.page,
      pageSize: half,
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

export async function fetchBrowsePage(opts: {
  kind: BrowseKind;
  sort: BrowseSort;
  section: BrowseSection;
  page: number;
  pageSize?: number;
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

  const withPages = (result: {
    items: CardScholarship[];
    totalCount: number;
    hasMore: boolean;
  }) => {
    const totalPages = Math.max(1, Math.ceil(result.totalCount / pageSize));
    return { ...result, page, pageSize, totalPages };
  };

  if (opts.kind === "all") {
    return withPages(
      await fetchAllKindsPage({
        sort: opts.sort,
        section: opts.section,
        page,
        pageSize,
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
      })
    );
  }

  return withPages(
    await fetchScholarshipPage({
      sort: opts.sort,
      section: opts.section,
      page,
      pageSize,
    })
  );
}

export function browsePageTitle(kind: BrowseKind, section: BrowseSection): string {
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
