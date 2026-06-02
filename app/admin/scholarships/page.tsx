import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ScholarshipTable from "./ScholarshipTable";

const PAGE_SIZE = 20;
type ScholarshipTypeFilter = "all" | "on_campus" | "off_campus";

function buildScholarshipListHref(params: {
  page?: number;
  q?: string;
  type?: ScholarshipTypeFilter;
}) {
  const qs = new URLSearchParams();
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  if (params.q) qs.set("q", params.q);
  if (params.type && params.type !== "all") qs.set("type", params.type);
  const query = qs.toString();
  return `/admin/scholarships${query ? `?${query}` : ""}`;
}

export default async function AdminScholarshipsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; q?: string; type?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const query = (resolvedSearchParams.q ?? "").trim();
  const rawType = resolvedSearchParams.type;
  const selectedType: ScholarshipTypeFilter =
    rawType === "on_campus" || rawType === "off_campus" ? rawType : "all";
  const pageFromQuery = Number.parseInt(resolvedSearchParams.page ?? "1", 10);
  const currentPage = Number.isFinite(pageFromQuery) && pageFromQuery > 0 ? pageFromQuery : 1;
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const supabase = await createClient();

  let scholarshipsQuery = supabase
    .from("scholarships")
    .select(
      "id, name, organization, scholarship_type, apply_start_date, apply_end_date, support_amount, support_amount_text, is_verified, support_types, poster_image_url, list_on_home, is_recommended, recommended_sort_order",
      { count: "exact" }
    )
    .eq("is_advertisement", false)
    .order("created_at", { ascending: false });

  if (selectedType !== "all") {
    scholarshipsQuery = scholarshipsQuery.eq("scholarship_type", selectedType);
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
      <div className="text-red-600 text-sm p-4 bg-red-50 rounded-lg">
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
  const tabItems: { key: ScholarshipTypeFilter; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "off_campus", label: "교외" },
    { key: "on_campus", label: "교내" },
  ];
  const currentScopeLabel =
    selectedType === "on_campus" ? "교내" : selectedType === "off_campus" ? "교외" : "전체";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">장학금 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            {query
              ? `${currentScopeLabel} 검색 결과 ${totalCount}개 중 ${rows.length}개 표시`
              : `${currentScopeLabel} 총 ${totalCount}개 중 ${rows.length}개 표시`}
          </p>
        </div>
        <Link
          href={`/admin/scholarships/new${selectedType === "all" ? "" : `?type=${selectedType}`}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          장학금 추가
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabItems.map((tab) => {
          const active = selectedType === tab.key;
          return (
            <Link
              key={tab.key}
              href={buildScholarshipListHref({ q: query || undefined, type: tab.key })}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <ScholarshipTable
        scholarships={rows}
        initialQuery={query}
        basePath="/admin/scholarships"
        createLabel="장학금 추가"
        fixedParams={selectedType === "all" ? {} : { type: selectedType }}
      />

      <div className="mt-5 flex items-center justify-between text-sm">
        <Link
          href={buildScholarshipListHref({
            page: Math.max(1, currentPage - 1),
            q: query || undefined,
            type: selectedType,
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
        <span className="text-gray-600">페이지 {currentPage}</span>
        <Link
          href={buildScholarshipListHref({
            page: currentPage + 1,
            q: query || undefined,
            type: selectedType,
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
    </div>
  );
}
