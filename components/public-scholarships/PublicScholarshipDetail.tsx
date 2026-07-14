import Link from "next/link";

import type { PublicScholarship } from "@/lib/scholarships/public-scholarship-read-model";

export function PublicScholarshipDetail({ scholarship }: { scholarship: PublicScholarship }) {
  return (
    <main className="min-h-screen bg-[#f8fafc] px-4 py-10 text-ink sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4 text-sm">
          <Link className="font-semibold text-brand hover:underline" href="/scholarships">
            장학금 목록으로
          </Link>
          <Link className="text-black/60 hover:underline" href="/">
            홈
          </Link>
        </div>
        <article className="mt-8 rounded-lg border border-black/10 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap gap-2 text-xs font-medium text-black/60">
            <span>{scholarship.organization}</span>
            <span>{scholarship.category}</span>
            <time dateTime={scholarship.publishedAt}>{scholarship.publishedAt}</time>
          </div>
          <h1 className="mt-4 text-3xl font-semibold leading-tight text-ink">{scholarship.title}</h1>
          <p className="mt-3 text-sm text-black/60">{scholarship.provenanceLabel}</p>

          <section className="mt-8 border-t border-black/10 pt-6">
            <h2 className="text-base font-semibold">공고 요약</h2>
            <p className="mt-3 whitespace-pre-line leading-7 text-black/75">{scholarship.body}</p>
          </section>

          <section className="mt-8 border-t border-black/10 pt-6">
            <h2 className="text-base font-semibold">원문 공고</h2>
            <p className="mt-2 text-sm leading-6 text-black/70">
              지원 자격, 일정, 제출 서류와 최종 조건은 반드시 원문 공고에서 확인해 주세요.
            </p>
            <a
              className="mt-3 inline-flex font-semibold text-brand hover:underline"
              href={scholarship.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              원문 공고 열기
            </a>
          </section>

          <section className="mt-8 border-t border-black/10 pt-6">
            <h2 className="text-base font-semibold">첨부파일</h2>
            <p className="mt-2 text-sm leading-6 text-black/70">
              첨부파일의 다운로드 가능 여부와 내용은 여기서 검증하지 않습니다. 원문 공고에서 확인해 주세요.
            </p>
            {scholarship.attachments.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm">
                {scholarship.attachments.map((attachment) => (
                  <li key={attachment.url}>
                    <a
                      className="font-medium text-brand hover:underline"
                      href={attachment.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {attachment.kind}: {attachment.url.split("/").at(-1)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-black/60">이 공고에는 첨부파일 메타데이터가 없습니다.</p>
            )}
          </section>
        </article>
      </div>
    </main>
  );
}
