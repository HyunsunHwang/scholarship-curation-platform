import Link from "next/link";

/** 홈 선반 섹션 제목 */
export default function HomeSectionTitle({
  id,
  title,
  href,
  subtitle,
  tone = "light",
}: {
  id: string;
  title: string;
  href?: string;
  subtitle?: string;
  /** dark: TOP 10 등 시네마틱 섹션용 */
  tone?: "light" | "dark";
}) {
  const isDark = tone === "dark";

  return (
    <div className="mb-3 flex items-end justify-between gap-3 sm:mb-4">
      <div className="min-w-0">
        <h2
          id={id}
          className={`text-xl font-bold tracking-tight sm:text-2xl ${
            isDark ? "text-white" : "text-ink"
          }`}
        >
          {href ? (
            <Link
              href={href}
              className={
                isDark
                  ? "transition-colors hover:text-white/80"
                  : "transition-colors hover:text-brand"
              }
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
        {subtitle ? (
          <p
            className={`mt-1 text-sm ${
              isDark ? "text-white/50" : "text-ink/50"
            }`}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
