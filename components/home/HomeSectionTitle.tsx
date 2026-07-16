import Link from "next/link";

/** 에어비앤비식: 제목 옆 원형 화살표 → 전체 목록 */
export default function HomeSectionTitle({
  id,
  title,
  href,
  subtitle,
}: {
  id: string;
  title: string;
  href?: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 sm:mb-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id={id}
            className="text-xl font-bold tracking-tight text-ink sm:text-2xl"
          >
            {href ? (
              <Link href={href} className="transition-colors hover:text-brand">
                {title}
              </Link>
            ) : (
              title
            )}
          </h2>
          {href ? (
            <Link
              href={href}
              aria-label={`${title} 전체 보기`}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-ink shadow-sm transition hover:border-ink/25 hover:bg-cream hover:shadow-md active:scale-95"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.25}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                />
              </svg>
            </Link>
          ) : null}
        </div>
        {subtitle ? (
          <p className="mt-1 text-sm text-ink/50">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}
