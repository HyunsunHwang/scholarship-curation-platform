import {
  experienceKindLabel,
  formatSpecPeriod,
  formatSpecDate,
  isExperienceType,
  SPEC_SECTIONS,
  type SpecItem,
} from "@/lib/profile-spec";
import { interestJobLabel, type InterestJobId } from "@/lib/interestCategories";
import {
  interestIndustryLabel,
  type InterestIndustryId,
} from "@/lib/interestIndustries";
import type { SkillName } from "@/lib/skills";
import { parseLanguageScore } from "@/lib/language-spec";

function compareDateDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);
}

export default function ProfilePreview({
  name,
  headline,
  bio,
  schoolLine,
  statusLine,
  interests,
  industries,
  skills,
  items,
}: {
  name: string;
  headline: string | null;
  bio: string | null;
  schoolLine: string;
  statusLine: string;
  interests: InterestJobId[];
  industries: InterestIndustryId[];
  skills: SkillName[];
  items: SpecItem[];
}) {
  const experienceItems = items
    .filter((item) => isExperienceType(item.item_type))
    .slice()
    .sort((a, b) => {
      const byStart = compareDateDesc(a.start_date, b.start_date);
      if (byStart !== 0) return byStart;
      return compareDateDesc(a.end_date, b.end_date);
    });

  const otherSections = SPEC_SECTIONS.filter((s) => !isExperienceType(s.type));

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{name}</h1>
        {headline ? (
          <p className="mt-1 text-sm font-medium text-ink/75">{headline}</p>
        ) : null}
        <div className="mt-1.5 space-y-0.5 text-sm text-ink/55">
          {schoolLine ? <p>{schoolLine}</p> : null}
          {statusLine ? <p>{statusLine}</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6">
        <h2 className="text-base font-bold text-ink">소개</h2>
        {bio ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
            {bio}
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink/40">소개가 아직 없어요.</p>
        )}
        <h3 className="mt-5 text-sm font-bold text-ink">관심 직무</h3>
        {interests.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {interests.map((id) => (
              <span
                key={id}
                className="rounded-xl border border-gray-200 bg-beige px-3 py-1 text-xs font-semibold text-ink/75"
              >
                {interestJobLabel(id)}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink/40">관심 직무가 아직 없어요.</p>
        )}
        <h3 className="mt-5 text-sm font-bold text-ink">관심 산업</h3>
        {industries.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {industries.map((id) => (
              <span
                key={id}
                className="rounded-xl border border-gray-200 bg-beige px-3 py-1 text-xs font-semibold text-ink/75"
              >
                {interestIndustryLabel(id)}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink/40">관심 산업이 아직 없어요.</p>
        )}
        <h3 className="mt-5 text-sm font-bold text-ink">보유 스킬</h3>
        {skills.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {skills.map((name) => (
              <span
                key={name}
                className="rounded-xl border border-gray-200 bg-beige px-3 py-1 text-xs font-semibold text-ink/75"
              >
                {name}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink/40">보유 스킬이 아직 없어요.</p>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6">
        <h2 className="text-base font-bold text-ink">
          경험
          {experienceItems.length > 0 ? (
            <span className="ml-1.5 text-sm font-semibold text-ink/40">
              {experienceItems.length}
            </span>
          ) : null}
        </h2>
        {experienceItems.length === 0 ? (
          <p className="mt-2 text-sm text-ink/40">경험이 아직 없어요.</p>
        ) : (
          <ul className="mt-4">
            {experienceItems.map((item, index) => {
              const period = formatSpecPeriod(item);
              const starLines = [
                { label: "역할", value: item.star_role ?? "" },
                { label: "행동", value: item.star_action ?? "" },
                { label: "결과", value: item.star_result ?? "", strong: true },
              ].filter((l) => l.value);
              const isLast = index === experienceItems.length - 1;
              return (
                <li key={item.id} className="relative flex gap-3">
                  <div className="relative flex w-4 shrink-0 flex-col items-center">
                    <span className="relative z-1 mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-brand bg-white" />
                    {!isLast ? (
                      <span className="absolute top-4 bottom-0 w-px bg-gray-200" />
                    ) : null}
                  </div>
                  <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-5"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-beige px-2 py-0.5 text-[11px] font-bold text-ink/60">
                        {experienceKindLabel(item.item_type)}
                      </span>
                      <p className="text-sm font-bold text-ink">{item.title}</p>
                    </div>
                    {(item.organization || period) ? (
                      <p className="mt-0.5 text-xs text-ink/50">
                        {[item.organization, period].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                    {starLines.length > 0 ? (
                      <dl className="mt-1.5 space-y-0.5">
                        {starLines.map((line) => (
                          <div key={line.label} className="flex gap-2 text-sm leading-relaxed">
                            <dt className="shrink-0 text-xs font-semibold leading-6 text-ink/45">
                              {line.label}
                            </dt>
                            <dd
                              className={`whitespace-pre-wrap ${
                                line.strong ? "font-semibold text-ink" : "text-ink/75"
                              }`}
                            >
                              {line.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : item.description ? (
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink/75">
                        {item.description}
                      </p>
                    ) : null}
                    {item.skills.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.skills.map((name) => (
                          <span
                            key={name}
                            className="rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-ink/65"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {otherSections.map((section) => {
        const sectionItems = items.filter((i) => i.item_type === section.type);
        return (
          <section
            key={section.type}
            className="rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6"
          >
            <h2 className="text-base font-bold text-ink">
              {section.label}
              {sectionItems.length > 0 ? (
                <span className="ml-1.5 text-sm font-semibold text-ink/40">
                  {sectionItems.length}
                </span>
              ) : null}
            </h2>
            {sectionItems.length === 0 ? (
              <p className="mt-2 text-sm text-ink/40">아직 없어요.</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100">
                {sectionItems.map((item) => {
                  const period = section.hasPeriod
                    ? formatSpecPeriod(item)
                    : formatSpecDate(item.start_date);
                  const langScore =
                    section.type === "language"
                      ? parseLanguageScore(item.description)
                      : null;
                  return (
                    <li key={item.id} className="py-3">
                      <p className="text-sm font-bold text-ink">{item.title}</p>
                      {section.type === "language" ? (
                        <p className="text-sm text-ink/60">
                          {[
                            item.organization,
                            langScore
                              ? [langScore.exam, langScore.score]
                                  .filter(Boolean)
                                  .join(" ")
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : item.organization ? (
                        <p className="text-sm text-ink/60">{item.organization}</p>
                      ) : null}
                      {period ? (
                        <p className="mt-0.5 text-xs text-ink/45">{period}</p>
                      ) : null}
                      {section.type !== "language" && item.description ? (
                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink/75">
                          {item.description}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
