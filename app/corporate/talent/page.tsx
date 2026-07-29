import Link from "next/link";
import { Suspense } from "react";
import TalentCard from "@/components/corporate/talent/TalentCard";
import TalentFilterSidebar from "@/components/corporate/talent/TalentFilterSidebar";
import {
  hasActiveTalentFilters,
  parseTalentSearchParams,
  talentFiltersToQuery,
  type TalentSort,
} from "@/lib/corporate/talent-params";
import { searchTalent } from "@/lib/corporate/talent-search";

const SORT_TABS: { value: TalentSort; label: string }[] = [
  { value: "recent", label: "최근 업데이트 순" },
  { value: "completeness", label: "적합도 순" },
];

export default async function CorporateTalentExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filters = parseTalentSearchParams(raw);
  const result = await searchTalent(filters);
  const filtersActive = hasActiveTalentFilters(filters);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink">인재 찾기</h1>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Suspense fallback={<div className="w-full lg:w-64" />}>
          <TalentFilterSidebar />
        </Suspense>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <nav aria-label="정렬" className="flex items-center gap-1">
              {SORT_TABS.map((tab) => {
                const active = filters.sort === tab.value;
                return (
                  <Link
                    key={tab.value}
                    href={`/corporate/talent${talentFiltersToQuery(filters, {
                      sort: tab.value,
                      page: 1,
                    })}`}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                      active
                        ? "bg-brand/15 text-brand"
                        : "text-ink/50 hover:bg-beige hover:text-ink"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
            <p className="text-sm text-ink/60">
              조건에 맞는 인재{" "}
              <span className="font-bold text-brand">
                {result.total.toLocaleString("ko-KR")}
              </span>
              명을 찾았어요
            </p>
          </div>

          {result.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
              <p className="text-base font-semibold text-ink">
                조건에 맞는 인재가 없어요
              </p>
              <p className="mt-2 text-sm text-ink/50">
                필터를 조정하거나 초기화해 보세요.
              </p>
              {filtersActive ? (
                <Link
                  href="/corporate/talent"
                  className="mt-4 inline-flex rounded-full border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/10"
                >
                  필터 초기화
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {result.items.map((talent) => (
                  <TalentCard key={talent.id} talent={talent} />
                ))}
              </div>

              {result.totalPages > 1 ? (
                <nav
                  aria-label="페이지"
                  className="flex items-center justify-center gap-2 pt-2"
                >
                  {result.page > 1 ? (
                    <Link
                      href={`/corporate/talent${talentFiltersToQuery(filters, {
                        page: result.page - 1,
                      })}`}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-ink/70 hover:border-brand/40 hover:text-brand"
                    >
                      이전
                    </Link>
                  ) : null}
                  <span className="px-2 text-sm text-ink/60">
                    {result.page} / {result.totalPages}
                  </span>
                  {result.page < result.totalPages ? (
                    <Link
                      href={`/corporate/talent${talentFiltersToQuery(filters, {
                        page: result.page + 1,
                      })}`}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-ink/70 hover:border-brand/40 hover:text-brand"
                    >
                      다음
                    </Link>
                  ) : null}
                </nav>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
