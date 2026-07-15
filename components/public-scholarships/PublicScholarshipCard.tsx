import Link from "next/link";

import type { PublicScholarship } from "@/lib/scholarships/public-scholarship-read-model";

export function PublicScholarshipCard({ scholarship }: { scholarship: PublicScholarship }) {
  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-black/60">
        <span>{scholarship.organization}</span>
        <span aria-hidden="true">/</span>
        <span>{scholarship.category}</span>
        <time dateTime={scholarship.publishedAt}>{scholarship.publishedAt}</time>
      </div>
      <h2 className="mt-3 break-words text-xl font-semibold text-ink">
        <Link className="hover:underline" href={`/scholarships/${scholarship.id}`}>
          {scholarship.title}
        </Link>
      </h2>
      <p className="mt-3 break-words text-sm leading-6 text-black/70">{scholarship.summary}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {scholarship.targetLabels.map((label) => (
          <span className="rounded-md bg-brand/10 px-2 py-1 text-xs font-medium text-brand" key={label}>
            {label}
          </span>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 text-sm">
        <span className="text-black/55">{scholarship.provenanceLabel}</span>
        <Link className="font-semibold text-brand hover:underline" href={`/scholarships/${scholarship.id}`}>
          자세히 보기
        </Link>
      </div>
    </article>
  );
}
