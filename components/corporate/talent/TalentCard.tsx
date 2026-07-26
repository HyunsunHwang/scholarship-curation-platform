import ProfileAvatar from "@/components/ProfileAvatar";
import type { TalentCardData } from "@/lib/corporate/talent-search";

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "brand" | "sky" | "violet";
}) {
  const tones = {
    brand: "bg-brand/10 text-brand",
    sky: "bg-sky-100 text-sky-700",
    violet: "bg-violet-100 text-violet-700",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export default function TalentCard({ talent }: { talent: TalentCardData }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-4">
        <ProfileAvatar
          src={talent.avatarUrl}
          alt={talent.maskedName}
          className="h-12 w-12"
          sizes="48px"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-base font-bold text-ink">
                  {talent.maskedName}
                </p>
                {talent.yearStatusLine ? (
                  <p className="text-xs text-ink/50">{talent.yearStatusLine}</p>
                ) : null}
              </div>
              {talent.schoolLine ? (
                <p className="mt-0.5 truncate text-sm text-ink/60">
                  {talent.schoolLine}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled
                title="저장 — 준비 중"
                aria-label="인재 저장 (준비 중)"
                className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full text-ink/30"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  className="h-5 w-5"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
                  />
                </svg>
              </button>
              <button
                type="button"
                disabled
                title="제안하기 — 준비 중"
                aria-label="제안하기 (준비 중)"
                className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full text-ink/30"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  className="h-5 w-5"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {talent.isOpenToOffers ? <Badge tone="brand">제안 환영</Badge> : null}
            <Badge tone="violet">{talent.activeAgo}</Badge>
            <Badge tone="sky">{talent.updatedAgo}</Badge>
          </div>

          {talent.headline ? (
            <p className="mt-2.5 line-clamp-2 text-sm text-ink/80">
              {talent.headline}
            </p>
          ) : null}

          {talent.highlights.length > 0 ||
          talent.certifications.length > 0 ||
          talent.languages.length > 0 ||
          talent.skills.length > 0 ? (
            <dl className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
              {talent.highlights.map((h, i) => (
                <div key={i} className="flex items-baseline gap-2 text-sm">
                  <dt className="w-14 shrink-0 text-xs font-semibold text-ink/40">
                    {h.kindLabel}
                  </dt>
                  <dd className="min-w-0 truncate text-ink/80">
                    {h.title}
                    {h.organization ? (
                      <span className="text-ink/50"> · {h.organization}</span>
                    ) : null}
                    {h.period ? (
                      <span className="text-ink/40"> · {h.period}</span>
                    ) : null}
                  </dd>
                </div>
              ))}
              {talent.certifications.length > 0 ? (
                <div className="flex items-baseline gap-2 text-sm">
                  <dt className="w-14 shrink-0 text-xs font-semibold text-ink/40">
                    자격증
                  </dt>
                  <dd className="min-w-0 truncate text-ink/80">
                    {talent.certifications.join(" · ")}
                    {talent.certOverflow > 0 ? (
                      <span className="text-ink/40">
                        {" · "}+{talent.certOverflow}
                      </span>
                    ) : null}
                  </dd>
                </div>
              ) : null}
              {talent.languages.length > 0 ? (
                <div className="flex items-baseline gap-2 text-sm">
                  <dt className="w-14 shrink-0 text-xs font-semibold text-ink/40">
                    언어
                  </dt>
                  <dd className="min-w-0 truncate text-ink/80">
                    {talent.languages.join(" · ")}
                    {talent.languageOverflow > 0 ? (
                      <span className="text-ink/40">
                        {" · "}+{talent.languageOverflow}
                      </span>
                    ) : null}
                  </dd>
                </div>
              ) : null}
              {talent.skills.length > 0 ? (
                <div className="flex items-baseline gap-2 text-sm">
                  <dt className="w-14 shrink-0 text-xs font-semibold text-ink/40">
                    스킬
                  </dt>
                  <dd className="min-w-0 truncate text-ink/80">
                    {talent.skills.join(" · ")}
                    {talent.skillOverflow > 0 ? (
                      <span className="text-ink/40">
                        {" · "}+{talent.skillOverflow}
                      </span>
                    ) : null}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {talent.interestJobLabels.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {talent.interestJobLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-ink/60"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
