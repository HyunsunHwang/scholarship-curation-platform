import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AdminKindTabs } from "@/components/admin/KindTabs";
import {
  adminKindLabel,
  contentNewPath,
  parseAdminContentKind,
  type AdminContentKind,
  type ContestContentKind,
} from "@/lib/admin-kinds";
import ScholarshipTable from "@/app/admin/scholarships/ScholarshipTable";
import ContestTable from "@/app/admin/content/contests/ContestTable";

const PAGE_SIZE = 20;
type ScholarshipTypeFilter = "all" | "on_campus" | "off_campus";

function buildContentHref(params: {
  kind: AdminContentKind;
  page?: number;
  q?: string;
  type?: ScholarshipTypeFilter;
  verified?: string;
}) {
  const qs = new URLSearchParams({ kind: params.kind });
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  if (params.q) qs.set("q", params.q);
  if (params.type && params.type !== "all") qs.set("type", params.type);
  if (params.verified === "true" || params.verified === "false") {
    qs.set("verified", params.verified);
  }
  return `/admin/content?${qs.toString()}`;
}

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams?: Promise<{
    kind?: string;
    page?: string;
    q?: string;
    type?: string;
    verified?: string;
  }>;
}) {
  const resolved = (await searchParams) ?? {};
  const kind = parseAdminContentKind(resolved.kind, "scholarship");
  const query = (resolved.q ?? "").trim();
  const verifiedFilter =
    resolved.verified === "true" || resolved.verified === "false"
      ? resolved.verified
      : "all";
  const rawType = resolved.type;
  const selectedType: ScholarshipTypeFilter =
    rawType === "on_campus" || rawType === "off_campus" ? rawType : "all";
  const pageFromQuery = Number.parseInt(resolved.page ?? "1", 10);
  const currentPage =
    Number.isFinite(pageFromQuery) && pageFromQuery > 0 ? pageFromQuery : 1;
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  const countQueries = await Promise.all([
    supabase
      .from("scholarships")
      .select("id", { count: "exact", head: true })
      .eq("is_advertisement", false),
    supabase
      .from("contests")
      .select("id", { count: "exact", head: true })
      .eq("content_kind", "contest"),
    supabase
      .from("contests")
      .select("id", { count: "exact", head: true })
      .eq("content_kind", "education"),
    supabase
      .from("contests")
      .select("id", { count: "exact", head: true })
      .eq("content_kind", "activity"),
  ]);

  const kindCounts: Partial<Record<AdminContentKind, number>> = {
    scholarship: countQueries[0].count ?? 0,
    contest: countQueries[1].count ?? 0,
    education: countQueries[2].count ?? 0,
    activity: countQueries[3].count ?? 0,
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">콘텐츠</h1>
          <p className="mt-1 text-sm text-gray-500">
            {adminKindLabel(kind)}을(를) 조회·등록·수정합니다.
          </p>
        </div>
        <Link
          href={contentNewPath(kind)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + {adminKindLabel(kind)} 추가
        </Link>
      </div>

      <AdminKindTabs
        basePath="/admin/content"
        activeKind={kind}
        counts={kindCounts}
      />

      {kind === "scholarship" ? (
        <ScholarshipContentList
          query={query}
          selectedType={selectedType}
          verifiedFilter={verifiedFilter}
          currentPage={currentPage}
          from={from}
          to={to}
        />
      ) : (
        <ContestContentList
          kind={kind}
          query={query}
          verifiedFilter={verifiedFilter}
          currentPage={currentPage}
          from={from}
          to={to}
        />
      )}
    </div>
  );
}

async function ScholarshipContentList({
  query,
  selectedType,
  verifiedFilter,
  currentPage,
  from,
  to,
}: {
  query: string;
  selectedType: ScholarshipTypeFilter;
  verifiedFilter: string;
  currentPage: number;
  from: number;
  to: number;
}) {
  const supabase = await createClient();
  let scholarshipsQuery = supabase
    .from("scholarships")
    .select(
      "id, name, organization, scholarship_type, apply_start_date, apply_end_date, support_amount_text, is_verified, support_types, poster_image_url, list_on_home, is_recommended, recommended_sort_order",
      { count: "exact" }
    )
    .eq("is_advertisement", false)
    .order("created_at", { ascending: false });

  if (selectedType !== "all") {
    scholarshipsQuery = scholarshipsQuery.eq("scholarship_type", selectedType);
  }
  if (verifiedFilter === "true") {
    scholarshipsQuery = scholarshipsQuery.eq("is_verified", true);
  } else if (verifiedFilter === "false") {
    scholarshipsQuery = scholarshipsQuery.eq("is_verified", false);
  }
  if (query) {
    const escaped = query.replace(/[%_]/g, "\\$&");
    scholarshipsQuery = scholarshipsQuery.or(
      `name.ilike.%${escaped}%,organization.ilike.%${escaped}%`
    );
  }

  const { data: scholarships, error, count } = await scholarshipsQuery.range(from, to);
  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
        데이터를 불러오는 중 오류가 발생했습니다: {error.message}
      </div>
    );
  }

  const rows = (scholarships ?? []).map((s) => ({
    ...s,
    support_types: s.support_types as string[],
  }));
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasNextPage = currentPage < totalPages;

  const typeTabs: { key: ScholarshipTypeFilter; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "off_campus", label: "교외" },
    { key: "on_campus", label: "교내" },
  ];
  const verifiedTabs = [
    { key: "all", label: "검증 전체" },
    { key: "false", label: "미검증" },
    { key: "true", label: "검증됨" },
  ] as const;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {typeTabs.map((tab) => (
          <Link
            key={tab.key}
            href={buildContentHref({
              kind: "scholarship",
              q: query || undefined,
              type: tab.key,
              verified: verifiedFilter === "all" ? undefined : verifiedFilter,
            })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              selectedType === tab.key
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </Link>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-gray-200 sm:block" />
        {verifiedTabs.map((tab) => (
          <Link
            key={tab.key}
            href={buildContentHref({
              kind: "scholarship",
              q: query || undefined,
              type: selectedType,
              verified: tab.key === "all" ? undefined : tab.key,
            })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              verifiedFilter === tab.key
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <p className="mb-3 text-sm text-gray-500">총 {totalCount}개</p>

      <ScholarshipTable
        scholarships={rows}
        initialQuery={query}
        basePath="/admin/content"
        editBasePath="/admin/content/scholarships"
        fixedParams={{
          kind: "scholarship",
          ...(selectedType !== "all" ? { type: selectedType } : {}),
          ...(verifiedFilter !== "all" ? { verified: verifiedFilter } : {}),
        }}
      />

      <Pagination
        kind="scholarship"
        currentPage={currentPage}
        totalPages={totalPages}
        hasNextPage={hasNextPage}
        query={query}
        type={selectedType}
        verified={verifiedFilter}
      />
    </div>
  );
}

async function ContestContentList({
  kind,
  query,
  verifiedFilter,
  currentPage,
  from,
  to,
}: {
  kind: ContestContentKind;
  query: string;
  verifiedFilter: string;
  currentPage: number;
  from: number;
  to: number;
}) {
  const supabase = await createClient();
  let contestsQuery = supabase
    .from("contests")
    .select(
      "id, name, organization, content_kind, apply_start_date, apply_end_date, support_amount_text, is_verified, list_on_home, is_recommended, recommended_sort_order, poster_image_url",
      { count: "exact" }
    )
    .eq("content_kind", kind)
    .order("created_at", { ascending: false });

  if (verifiedFilter === "true") {
    contestsQuery = contestsQuery.eq("is_verified", true);
  } else if (verifiedFilter === "false") {
    contestsQuery = contestsQuery.eq("is_verified", false);
  }
  if (query) {
    const escaped = query.replace(/[%_]/g, "\\$&");
    contestsQuery = contestsQuery.or(
      `name.ilike.%${escaped}%,organization.ilike.%${escaped}%`
    );
  }

  const { data, error, count } = await contestsQuery.range(from, to);
  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
        데이터를 불러오는 중 오류가 발생했습니다: {error.message}
      </div>
    );
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasNextPage = currentPage < totalPages;
  const verifiedTabs = [
    { key: "all", label: "검증 전체" },
    { key: "false", label: "미검증" },
    { key: "true", label: "검증됨" },
  ] as const;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {verifiedTabs.map((tab) => (
          <Link
            key={tab.key}
            href={buildContentHref({
              kind,
              q: query || undefined,
              verified: tab.key === "all" ? undefined : tab.key,
            })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              verifiedFilter === tab.key
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <p className="mb-3 text-sm text-gray-500">총 {totalCount}개</p>
      <ContestSearchForm kind={kind} initialQuery={query} verifiedFilter={verifiedFilter} />
      <ContestTable rows={data ?? []} kind={kind} />
      <Pagination
        kind={kind}
        currentPage={currentPage}
        totalPages={totalPages}
        hasNextPage={hasNextPage}
        query={query}
        verified={verifiedFilter}
      />
    </div>
  );
}

function ContestSearchForm({
  kind,
  initialQuery,
  verifiedFilter,
}: {
  kind: ContestContentKind;
  initialQuery: string;
  verifiedFilter: string;
}) {
  return (
    <form method="get" action="/admin/content" className="mb-4 flex items-center gap-2">
      <input type="hidden" name="kind" value={kind} />
      {verifiedFilter !== "all" ? (
        <input type="hidden" name="verified" value={verifiedFilter} />
      ) : null}
      <input
        type="search"
        name="q"
        defaultValue={initialQuery}
        placeholder="이름 또는 기관명으로 검색..."
        className="w-full rounded-lg border border-gray-200 bg-white py-2.5 px-3 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
      <button
        type="submit"
        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        검색
      </button>
    </form>
  );
}

function Pagination({
  kind,
  currentPage,
  totalPages,
  hasNextPage,
  query,
  type,
  verified,
}: {
  kind: AdminContentKind;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  query: string;
  type?: ScholarshipTypeFilter;
  verified: string;
}) {
  return (
    <div className="mt-5 flex items-center justify-between text-sm">
      <Link
        href={buildContentHref({
          kind,
          page: Math.max(1, currentPage - 1),
          q: query || undefined,
          type,
          verified: verified === "all" ? undefined : verified,
        })}
        aria-disabled={currentPage <= 1}
        className={`rounded-lg border px-3 py-1.5 ${
          currentPage <= 1
            ? "pointer-events-none border-gray-200 text-gray-300"
            : "border-gray-300 text-gray-700 hover:bg-gray-50"
        }`}
      >
        이전
      </Link>
      <span className="text-gray-600">
        페이지 {currentPage} / {totalPages}
      </span>
      <Link
        href={buildContentHref({
          kind,
          page: currentPage + 1,
          q: query || undefined,
          type,
          verified: verified === "all" ? undefined : verified,
        })}
        aria-disabled={!hasNextPage}
        className={`rounded-lg border px-3 py-1.5 ${
          !hasNextPage
            ? "pointer-events-none border-gray-200 text-gray-300"
            : "border-gray-300 text-gray-700 hover:bg-gray-50"
        }`}
      >
        다음
      </Link>
    </div>
  );
}
