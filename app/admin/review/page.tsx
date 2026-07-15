import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AdminKindTabs } from "@/components/admin/KindTabs";
import {
  adminKindLabel,
  parseAdminContentKind,
  reviewDetailPath,
  type AdminContentKind,
  type ContestContentKind,
} from "@/lib/admin-kinds";
import CrawledNoticeRowActions from "@/app/admin/crawled-notices/CrawledNoticeRowActions";
import CrawledContestRowActions from "@/app/admin/review/contests/CrawledContestRowActions";

const PAGE_SIZE = 30;
type StatusFilter = "new" | "promoted" | "rejected";

const LEGACY_REVIEW_SCOPE = {
  decisionModel: "현재 행 lifecycle 변경 방식",
  projection: "append-only review event와 controlled public projection은 Phase L 범위",
} as const;

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
  thedream: "더드림",
  linkareer: "링커리어",
  unknown: "기타",
};

function buildHref(params: {
  kind: AdminContentKind;
  status?: StatusFilter;
  page?: number;
}) {
  const qs = new URLSearchParams({ kind: params.kind });
  if (params.status && params.status !== "new") qs.set("status", params.status);
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  return `/admin/review?${qs.toString()}`;
}

export default async function AdminReviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ kind?: string; status?: string; page?: string }>;
}) {
  const resolved = (await searchParams) ?? {};
  const kind = parseAdminContentKind(resolved.kind, "scholarship");
  const selectedStatus: StatusFilter =
    resolved.status === "promoted" || resolved.status === "rejected"
      ? resolved.status
      : "new";
  const pageFromQuery = Number.parseInt(resolved.page ?? "1", 10);
  const currentPage =
    Number.isFinite(pageFromQuery) && pageFromQuery > 0 ? pageFromQuery : 1;
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const backingTable = kind === "scholarship" ? "crawled_notices" : "crawled_contests";
  const publicDomainTable = kind === "scholarship" ? "scholarships" : "contests";

  const supabase = await createClient();

  const [schNew, conNew, eduNew, actNew] = await Promise.all([
    supabase
      .from("crawled_notices")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    supabase
      .from("crawled_contests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .eq("content_kind", "contest"),
    supabase
      .from("crawled_contests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .eq("content_kind", "education"),
    supabase
      .from("crawled_contests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .eq("content_kind", "activity"),
  ]);

  const kindCounts: Partial<Record<AdminContentKind, number>> = {
    scholarship: schNew.count ?? 0,
    contest: conNew.count ?? 0,
    education: eduNew.count ?? 0,
    activity: actNew.count ?? 0,
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">검수 큐</h1>
        <p className="mt-1 text-sm text-gray-500">
          수집된 {adminKindLabel(kind)} 공지를 검수하고 등록합니다.
        </p>
      </div>

      <AdminKindTabs
        basePath="/admin/review"
        activeKind={kind}
        counts={kindCounts}
        extraQuery={selectedStatus !== "new" ? { status: selectedStatus } : undefined}
      />

      <section className="mt-5 border-y border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950" aria-label="현재 검토 범위">
        <p className="font-semibold">현재 검토 범위</p>
        <p className="mt-1 leading-6 text-amber-900">
          이 대기열은 현재 DB 기반 compatibility lifecycle을 사용합니다. 승인과 거절은 기존 행을 변경하고
          legacy {publicDomainTable} 레코드를 만들 수 있지만, append-only review event 또는 controlled crawler
          public projection은 아닙니다.
        </p>
        <dl className="mt-3 grid gap-2 text-xs text-amber-900 sm:grid-cols-3 sm:text-sm">
          <div><dt className="font-medium">데이터 기반</dt><dd>DB 기반: {backingTable}</dd></div>
          <div><dt className="font-medium">결정 모델</dt><dd>{LEGACY_REVIEW_SCOPE.decisionModel}</dd></div>
          <div><dt className="font-medium">Phase L 경계</dt><dd>{LEGACY_REVIEW_SCOPE.projection}</dd></div>
        </dl>
      </section>

      {kind === "scholarship" ? (
        <ScholarshipReviewList
          selectedStatus={selectedStatus}
          currentPage={currentPage}
          from={from}
          to={to}
        />
      ) : (
        <ContestReviewList
          kind={kind}
          selectedStatus={selectedStatus}
          currentPage={currentPage}
          from={from}
          to={to}
        />
      )}
    </div>
  );
}

async function ScholarshipReviewList({
  selectedStatus,
  currentPage,
  from,
  to,
}: {
  selectedStatus: StatusFilter;
  currentPage: number;
  from: number;
  to: number;
}) {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("crawled_notices")
    .select(
      "id, source_group, source_id, source_name, title, notice_url, notice_posted_at, raw_date_text, status, scholarship_id, first_seen_at, last_seen_at, run_at, body, image_urls, review_note",
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

  return (
    <ReviewTable
      kind="scholarship"
      selectedStatus={selectedStatus}
      currentPage={currentPage}
      totalCount={count ?? 0}
      rows={(data ?? []).map((row) => ({
        id: row.id,
        sourceLabel: SOURCE_GROUP_LABELS[row.source_group] ?? row.source_group,
        sourceId: row.source_id,
        sourceName: row.source_name,
        title: row.title,
        noticeUrl: row.notice_url,
        postedAt: row.notice_posted_at ?? row.raw_date_text ?? "-",
        status: row.status,
        publishedId: row.scholarship_id,
        hasBody: Boolean(row.body?.trim()),
        attachmentCount: row.image_urls?.length ?? 0,
        lastObservedAt: row.last_seen_at ?? row.run_at,
        reviewNote: row.review_note,
      }))}
    />
  );
}

async function ContestReviewList({
  kind,
  selectedStatus,
  currentPage,
  from,
  to,
}: {
  kind: ContestContentKind;
  selectedStatus: StatusFilter;
  currentPage: number;
  from: number;
  to: number;
}) {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("crawled_contests")
    .select(
      "id, source_group, source_id, source_name, title, notice_url, notice_posted_at, raw_date_text, status, contest_id, first_seen_at, last_seen_at, run_at, body, image_urls, review_note, content_kind",
      { count: "exact" }
    )
    .eq("status", selectedStatus)
    .eq("content_kind", kind)
    .order("first_seen_at", { ascending: false })
    .range(from, to);

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
        데이터를 불러오는 중 오류가 발생했습니다: {error.message}
      </div>
    );
  }

  return (
    <ReviewTable
      kind={kind}
      selectedStatus={selectedStatus}
      currentPage={currentPage}
      totalCount={count ?? 0}
      rows={(data ?? []).map((row) => ({
        id: row.id,
        sourceLabel: SOURCE_GROUP_LABELS[row.source_group] ?? row.source_group,
        sourceId: row.source_id,
        sourceName: row.source_name,
        title: row.title,
        noticeUrl: row.notice_url,
        postedAt: row.notice_posted_at ?? row.raw_date_text ?? "-",
        status: row.status,
        publishedId: row.contest_id,
        hasBody: Boolean(row.body?.trim()),
        attachmentCount: row.image_urls?.length ?? 0,
        lastObservedAt: row.last_seen_at ?? row.run_at,
        reviewNote: row.review_note,
      }))}
    />
  );
}

function ReviewTable({
  kind,
  selectedStatus,
  currentPage,
  totalCount,
  rows,
}: {
  kind: AdminContentKind;
  selectedStatus: StatusFilter;
  currentPage: number;
  totalCount: number;
  rows: Array<{
    id: number;
    sourceLabel: string;
    sourceId: string;
    sourceName: string;
    title: string;
    noticeUrl: string;
    postedAt: string;
    status: StatusFilter;
    publishedId: number | null;
    hasBody: boolean;
    attachmentCount: number;
    lastObservedAt: string | null;
    reviewNote: string | null;
  }>;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasNextPage = currentPage < totalPages;
  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: "new", label: "검수 대기" },
    { key: "promoted", label: "등록 완료" },
    { key: "rejected", label: "거절됨" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {statusTabs.map((tab) => {
          const active = selectedStatus === tab.key;
          return (
            <Link
              key={tab.key}
              href={buildHref({ kind, status: tab.key })}
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
              <th className="px-4 py-3 text-left font-medium text-gray-500">출처</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">제목</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">게시일</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                  표시할 항목이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {row.sourceLabel}
                    <div className="text-xs text-gray-400">{row.sourceName}</div>
                    <div className="mt-1 text-xs text-gray-400">소스 ID: {row.sourceId || "확인 불가"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={row.noticeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-gray-900 hover:text-blue-600 hover:underline"
                    >
                      {row.title}
                    </a>
                    <div className="mt-1 space-y-1 text-xs text-gray-500">
                      <p>근거: {row.hasBody ? "본문 수집됨" : "본문 없음"} · 첨부 메타데이터 {row.attachmentCount}건</p>
                      <p>마지막 관측: {row.lastObservedAt ?? "확인 불가"}</p>
                      {row.reviewNote ? <p>검토 메모: {row.reviewNote}</p> : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {row.postedAt}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      {row.status === "new" && (
                        <Link
                          href={reviewDetailPath(kind, row.id)}
                          className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          검수 후 등록
                        </Link>
                      )}
                      {row.status === "promoted" && row.publishedId ? (
                        <Link
                          href={
                            kind === "scholarship"
                              ? `/admin/content/scholarships/${row.publishedId}/edit`
                              : `/admin/content/contests/${row.publishedId}/edit?kind=${kind}`
                          }
                          className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          발행본 보기
                        </Link>
                      ) : null}
                      {kind === "scholarship" ? (
                        <CrawledNoticeRowActions
                          noticeId={row.id}
                          status={row.status}
                        />
                      ) : (
                        <CrawledContestRowActions
                          crawledId={row.id}
                          status={row.status}
                        />
                      )}
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
            kind,
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
          href={buildHref({
            kind,
            status: selectedStatus,
            page: currentPage + 1,
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
