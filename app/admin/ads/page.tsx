import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ScholarshipTable from "../scholarships/ScholarshipTable";

const PAGE_SIZE = 20;

export default async function AdminAdsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; q?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const query = (resolvedSearchParams.q ?? "").trim();
  const pageFromQuery = Number.parseInt(resolvedSearchParams.page ?? "1", 10);
  const currentPage = Number.isFinite(pageFromQuery) && pageFromQuery > 0 ? pageFromQuery : 1;
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const supabase = await createClient();

  let adsQuery = supabase
    .from("scholarships")
    .select(
      "id, name, organization, apply_start_date, apply_end_date, support_amount_text, is_verified, support_types, poster_image_url, list_on_home, is_recommended, recommended_sort_order",
      { count: "exact" }
    )
    .eq("is_advertisement", true)
    .order("created_at", { ascending: false });

  if (query) {
    const escaped = query.replace(/[%_]/g, "\\$&");
    adsQuery = adsQuery.or(`name.ilike.%${escaped}%,organization.ilike.%${escaped}%`);
  }

  const { data: ads, error, count } = await adsQuery.range(from, to);

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
        데이터를 불러오는 중 오류가 발생했습니다: {error.message}
      </div>
    );
  }

  const rows = (ads ?? []).map((s) => ({
    ...s,
    support_types: s.support_types as string[],
  }));
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasNextPage = currentPage < totalPages;
  const queryString = query ? `&q=${encodeURIComponent(query)}` : "";

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">광고 관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            {query
              ? `검색 결과 ${totalCount}개 중 ${rows.length}개 표시`
              : `총 ${totalCount}개 중 ${rows.length}개 표시`}
          </p>
        </div>
        <Link
          href="/admin/ads/new"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          광고 추가
        </Link>
      </div>

      <ScholarshipTable
        scholarships={rows}
        initialQuery={query}
        basePath="/admin/ads"
        createLabel="광고 추가"
      />

      <div className="mt-5 flex items-center justify-between text-sm">
        <Link
          href={`/admin/ads?page=${Math.max(1, currentPage - 1)}${queryString}`}
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
          href={`/admin/ads?page=${currentPage + 1}${queryString}`}
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
