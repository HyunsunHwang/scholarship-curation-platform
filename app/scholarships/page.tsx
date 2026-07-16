import Link from "next/link";

import { PublicScholarshipCard } from "@/components/public-scholarships/PublicScholarshipCard";
import { PublicScholarshipDataStatus } from "@/components/public-scholarships/PublicScholarshipDataStatus";
import {
  getPublicScholarshipPageModel,
} from "@/lib/scholarships/public-scholarship-service";

type ScholarshipSearchParams = Promise<{
  q?: string;
  organization?: string;
  category?: string;
}>;

export default async function PublicScholarshipsPage({
  searchParams,
}: {
  searchParams: ScholarshipSearchParams;
}) {
  const params = await searchParams;
  const initialModel = await getPublicScholarshipPageModel({
    query: params.q,
    organization: params.organization,
    category: params.category,
  });
  const { organizations, categories } = initialModel;
  const organization = organizations.includes(params.organization ?? "") ? params.organization : undefined;
  const category = categories.includes(params.category ?? "") ? params.category : undefined;
  const model =
    organization === params.organization && category === params.category
      ? initialModel
      : await getPublicScholarshipPageModel({
          query: params.q,
          organization,
          category,
        });
  const readModelStatus = model.status;
  const scholarships = model.scholarships;

  return (
    <main className="min-h-screen overflow-hidden bg-[#f8fafc] px-4 py-10 text-ink sm:px-6">
      <div className="mx-auto min-w-0 max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand">장학금 안내</p>
            <h1 className="mt-1 text-3xl font-semibold">검토된 장학금 공고</h1>
          </div>
          <Link className="text-sm font-medium text-black/65 hover:underline" href="/">
            홈
          </Link>
        </header>

        <form className="mt-8 grid w-full min-w-0 gap-3 rounded-lg border border-black/10 bg-white p-4 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]" method="get">
          <label className="sr-only" htmlFor="scholarship-search">
            장학금 검색
          </label>
          <input
            className="h-11 min-w-0 rounded-md border border-black/15 px-3 text-sm outline-none ring-brand focus:ring-2"
            defaultValue={params.q}
            id="scholarship-search"
            name="q"
            placeholder="공고명, 기관, 지원 대상을 검색하세요"
            type="search"
          />
          <label className="sr-only" htmlFor="scholarship-organization">
            기관
          </label>
          <select
            className="h-11 w-full min-w-0 rounded-md border border-black/15 bg-white px-3 text-sm"
            defaultValue={organization ?? ""}
            id="scholarship-organization"
            name="organization"
          >
            <option value="">전체 기관</option>
            {organizations.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="scholarship-category">
            카테고리
          </label>
          <select
            className="h-11 w-full min-w-0 rounded-md border border-black/15 bg-white px-3 text-sm"
            defaultValue={category ?? ""}
            id="scholarship-category"
            name="category"
          >
            <option value="">전체 카테고리</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button className="h-11 w-full rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand/90" type="submit">
            검색
          </button>
        </form>

        <div className="mt-5">
          <PublicScholarshipDataStatus status={readModelStatus} />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm text-black/60">
          <p>현재 스냅샷에서 공개 가능한 공고 {scholarships.length}건</p>
          {(params.q || organization || category) && (
            <Link className="font-medium text-brand hover:underline" href="/scholarships">
              필터 초기화
            </Link>
          )}
        </div>

        {scholarships.length > 0 ? (
          <section className="mt-4 grid gap-4 md:grid-cols-2" aria-label="장학금 공고">
            {scholarships.map((scholarship) => (
              <PublicScholarshipCard key={scholarship.id} scholarship={scholarship} />
            ))}
          </section>
        ) : (
          <section className="mt-4 border-y border-black/10 py-12 text-center">
            <h2 className="text-lg font-semibold">조건에 맞는 검토 공고가 없습니다.</h2>
            <p className="mt-2 text-sm text-black/60">검색어를 바꾸거나 필터를 초기화해 보세요.</p>
          </section>
        )}

        <aside className="mt-10 border-t border-black/10 pt-5 text-sm leading-6 text-black/65">
          이 목록은 검토 및 정책 승인을 거친 장학금 정보 일부만 보여 줍니다. 전체 출처 범위, 파서 완전성, 전국 장학금 전체를 의미하지 않습니다.
        </aside>
      </div>
    </main>
  );
}
