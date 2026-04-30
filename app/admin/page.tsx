import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const cards = [
  {
    href: "/admin/scholarships",
    title: "장학금 관리",
    description: "등록된 장학금을 조회·추가·수정합니다.",
  },
  {
    href: "/admin/site-settings",
    title: "사이트 설정",
    description: "메인 헤더에 표시되는 로고 이미지를 변경합니다.",
  },
];

function formatDateKst(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(date);
}

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const startDate = formatDateKst(sevenDaysAgo);
  const todayDate = formatDateKst(today);

  const [
    { data: dailyRows },
    { data: todaySearchRows },
    { data: scholarshipKpiRows },
  ] = await Promise.all([
    supabase
      .from("analytics_daily_kpi")
      .select(
        "metric_date, page_view_count, unique_user_count, search_count, bookmark_toggle_count, scholarship_open_count, apply_click_count"
      )
      .gte("metric_date", startDate)
      .order("metric_date", { ascending: true }),
    supabase
      .from("analytics_search_term_daily")
      .select("search_query, search_count")
      .eq("metric_date", todayDate)
      .order("search_count", { ascending: false })
      .limit(10),
    supabase
      .from("analytics_scholarship_daily_kpi")
      .select(
        "scholarship_id, detail_view_count, bookmark_toggle_count, apply_click_count, unique_user_count, metric_date"
      )
      .gte("metric_date", startDate),
  ]);

  const totals = (dailyRows ?? []).reduce(
    (acc, row) => {
      acc.pageViews += row.page_view_count;
      acc.users += row.unique_user_count;
      acc.searches += row.search_count;
      acc.bookmarks += row.bookmark_toggle_count;
      acc.details += row.scholarship_open_count;
      acc.applies += row.apply_click_count;
      return acc;
    },
    { pageViews: 0, users: 0, searches: 0, bookmarks: 0, details: 0, applies: 0 }
  );

  const scholarshipAggMap = new Map<
    number,
    { detail: number; bookmark: number; apply: number; users: number }
  >();
  for (const row of scholarshipKpiRows ?? []) {
    const current = scholarshipAggMap.get(row.scholarship_id) ?? {
      detail: 0,
      bookmark: 0,
      apply: 0,
      users: 0,
    };
    current.detail += row.detail_view_count;
    current.bookmark += row.bookmark_toggle_count;
    current.apply += row.apply_click_count;
    current.users += row.unique_user_count;
    scholarshipAggMap.set(row.scholarship_id, current);
  }
  const topScholarshipRows = [...scholarshipAggMap.entries()]
    .map(([scholarshipId, metrics]) => ({ scholarshipId, ...metrics }))
    .sort((a, b) => b.detail - a.detail)
    .slice(0, 10);
  const topScholarshipIds = topScholarshipRows.map((row) => row.scholarshipId);
  const { data: scholarshipNameRows } =
    topScholarshipIds.length > 0
      ? await supabase.from("scholarships").select("id, name").in("id", topScholarshipIds)
      : { data: [] };
  const scholarshipNameMap = new Map(
    (scholarshipNameRows ?? []).map((row) => [row.id, row.name])
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
      <p className="text-sm text-gray-500 mt-1 mb-8">
        관리 메뉴에서 작업을 선택하세요.
      </p>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500">최근 7일 페이지뷰</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{formatNumber(totals.pageViews)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500">최근 7일 검색 수</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{formatNumber(totals.searches)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500">최근 7일 지원 클릭</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{formatNumber(totals.applies)}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">일간 KPI (최근 7일)</h2>
          <div className="mt-4 space-y-3">
            {(dailyRows ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">아직 집계 데이터가 없습니다.</p>
            ) : (
              (dailyRows ?? []).map((row) => (
                <div key={row.metric_date} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <p className="font-medium text-gray-800">{row.metric_date}</p>
                  <p className="mt-1 text-gray-600">
                    조회 {formatNumber(row.page_view_count)} · 검색 {formatNumber(row.search_count)} ·
                    스크랩 {formatNumber(row.bookmark_toggle_count)} · 지원클릭{" "}
                    {formatNumber(row.apply_click_count)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">오늘 인기 검색어 TOP 10</h2>
          <div className="mt-4 space-y-2">
            {(todaySearchRows ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">오늘 검색 데이터가 없습니다.</p>
            ) : (
              (todaySearchRows ?? []).map((row, index) => (
                <div key={`${row.search_query}-${index}`} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <span className="truncate text-gray-800">
                    {index + 1}. {row.search_query}
                  </span>
                  <span className="ml-3 shrink-0 font-semibold text-brand">
                    {formatNumber(row.search_count)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">
          장학금 성과 TOP 10 (최근 7일, 상세조회 기준)
        </h2>
        <div className="mt-4 space-y-2">
          {topScholarshipRows.length === 0 ? (
            <p className="text-sm text-gray-500">장학금 성과 데이터가 없습니다.</p>
          ) : (
            topScholarshipRows.map((row, index) => (
              <div
                key={row.scholarshipId}
                className="rounded-lg border border-gray-100 px-3 py-2 text-sm"
              >
                <p className="font-medium text-gray-900">
                  {index + 1}. {scholarshipNameMap.get(row.scholarshipId) ?? `장학금 #${row.scholarshipId}`}
                </p>
                <p className="mt-1 text-gray-600">
                  상세조회 {formatNumber(row.detail)} · 스크랩 {formatNumber(row.bookmark)} · 지원클릭{" "}
                  {formatNumber(row.apply)} · 사용자 {formatNumber(row.users)}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <ul className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md hover:border-brand/30"
            >
              <h2 className="text-lg font-semibold text-gray-900">{c.title}</h2>
              <p className="text-sm text-gray-600 mt-1">{c.description}</p>
              <span className="inline-block mt-3 text-sm font-medium text-brand">
                이동 →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
