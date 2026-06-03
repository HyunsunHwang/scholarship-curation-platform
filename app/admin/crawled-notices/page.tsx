import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CrawledNoticeRowActions from "./CrawledNoticeRowActions";

const PAGE_SIZE = 30;
type StatusFilter = "new" | "promoted" | "rejected";

const SOURCE_GROUP_LABELS: Record<string, string> = {
  cau: "중앙대",
  ewha: "이화여대",
  hanyang: "한양대",
  hongik: "홍익대",
  khu: "경희대",
  korea: "고려대",
  skku: "성균관대",
  uos: "시립대",
  yonsei: "연세대",
  unknown: "기타",
};

function buildHref(params: { status?: StatusFilter; page?: number }) {
  const qs = new URLSearchParams();
  if (params.status && params.status !== "new") qs.set("status", params.status);
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  const query = qs.toString();
  return `/admin/crawled-notices${query ? `?${query}` : ""}`;
}

export default async function CrawledNoticesPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; page?: string }>;
}) {
  const resolved = (await searchParams) ?? {};
  const rawStatus = resolved.status;
  const selectedStatus: StatusFilter =
    rawStatus === "promoted" || rawStatus === "rejected" ? rawStatus : "new";
  const pageFromQuery = Number.parseInt(resolved.page ?? "1", 10);
  const currentPage =
    Number.isFinite(pageFromQuery) && pageFromQuery > 0 ? pageFromQuery : 1;
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("crawled_notices")
    .select(
      "id, source_group, source_name, title, notice_url, notice_posted_at, raw_date_text, status, scholarship_id, first_seen_at",
      { count: "exact" }
    )
    .eq("status", selectedStatus)
    .order("first_seen_at", { ascending: false })
    .range(from, to);

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
        데이터를 불러오는 중 오류가 발생했습니다: {error.message}
      </div>
    );
  }

  const rows = data ?? [];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasNextPage = currentPage < totalPages;

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: "new", label: "검수 대기" },
    { key: "promoted", label: "등록 완료" },
    { key: "rejected", label: "거절됨" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">수집 공지 검수</h1>
        <p className="mt-1 text-sm text-gray-500">
          크롤러가 수집한 장학 공지입니다. 검수 후 장학금으로 등록하세요.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((tab) => {
          const active = selectedStatus === tab.key;
          return (
            <Link
              key={tab.key}
              href={buildHref({ status: tab.key })}
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

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">
                대학
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">
                제목
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">
                게시일
              </th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">
                작업
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-gray-400"
                >
                  표시할 공지가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {SOURCE_GROUP_LABELS[row.source_group] ?? row.source_group}
                    <div className="text-xs text-gray-400">
                      {row.source_name}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={row.notice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-gray-900 hover:text-blue-600 hover:underline"
                    >
                      {row.title}
                    </a>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {row.notice_posted_at ?? row.raw_date_text ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      {row.status === "new" && (
                        <Link
                          href={`/admin/crawled-notices/${row.id}`}
                          className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          검수 후 등록
                        </Link>
                      )}
                      {row.status === "promoted" && row.scholarship_id && (
                        <Link
                          href={`/admin/scholarships/${row.scholarship_id}/edit`}
                          className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          장학금 보기
                        </Link>
                      )}
                      <CrawledNoticeRowActions
                        noticeId={row.id}
                        status={row.status}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex items-center justify-between text-sm">
        <Link
          href={buildHref({
            status: selectedStatus,
            page: Math.max(1, currentPage - 1),
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
          페이지 {currentPage} / {totalPages} · 총 {totalCount}건
        </span>
        <Link
          href={buildHref({ status: selectedStatus, page: currentPage + 1 })}
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
