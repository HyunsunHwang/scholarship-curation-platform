"use client";

import Image from "next/image";
import Link from "next/link";
import type { CardScholarship } from "@/components/ScholarshipCard";
import CardBookmarkButton from "@/components/CardBookmarkButton";
import { useAnnouncementLinkClick } from "@/components/announcement/AnnouncementModalProvider";
import { contentKindHref, contentKindLabel } from "@/lib/content-categories";
import {
  daysUntilApplyDeadlineKorea,
  isAlwaysOpenRecruitment,
} from "@/lib/scholarship-dates";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { formatCardSupportLine } from "@/lib/support-amount";

function deadlineLabel(dateStr: string): string {
  if (isAlwaysOpenRecruitment(dateStr)) return "상시모집";
  const days = daysUntilApplyDeadlineKorea(dateStr);
  if (days < 0) return "마감됨";
  if (days === 0) return "오늘 마감";
  if (days <= 7) return `D-${days} · 마감 임박`;
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m)}월 ${parseInt(d)}일 마감`;
}

export default function HomeHero({
  scholarship,
  bookmarked,
  eyebrow,
  showMatchedCta = false,
}: {
  scholarship: CardScholarship;
  bookmarked: boolean;
  eyebrow?: string;
  showMatchedCta?: boolean;
}) {
  const displayName = cleanScholarshipName(scholarship.name);
  const href = contentKindHref(scholarship.content_kind, scholarship.id);
  const kind = scholarship.content_kind ?? "scholarship";
  const onAnnouncementClick = useAnnouncementLinkClick(kind, scholarship.id);
  const isContestLike =
    kind === "contest" || kind === "education" || kind === "activity";
  const supportAmount = formatCardSupportLine({
    contentKind: scholarship.content_kind,
    supportAmountText: scholarship.support_amount_text,
    benefits: scholarship.benefits,
    additionalNote: scholarship.benefit_note,
    noticeText: scholarship.benefit_notice_text,
  });

  return (
    <section aria-labelledby="home-hero-heading" className="relative">
      <div className="relative overflow-hidden rounded-2xl bg-ink sm:rounded-3xl">
        <div className="absolute inset-0">
          {scholarship.poster_image_url ? (
            <Image
              src={scholarship.poster_image_url}
              alt=""
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 900px"
              className="object-cover object-top opacity-55"
            />
          ) : (
            <div className="h-full w-full bg-linear-to-br from-ink via-[#3a241c] to-brand/80" />
          )}
          <div className="absolute inset-0 bg-linear-to-r from-black/80 via-black/55 to-black/20" />
          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-black/10" />
        </div>

        <CardBookmarkButton
          scholarshipId={scholarship.id}
          initialBookmarked={bookmarked}
          bookmarkTarget={isContestLike ? "contest" : "scholarship"}
        />

        <div className="relative z-10 flex min-h-[220px] flex-col justify-end gap-4 px-5 py-6 sm:min-h-[280px] sm:px-8 sm:py-8 md:min-h-[320px] md:max-w-[62%]">
          <div className="flex flex-wrap items-center gap-2">
            {eyebrow ? (
              <span className="rounded-sm bg-brand px-2 py-0.5 text-[11px] font-bold tracking-wide text-white">
                {eyebrow}
              </span>
            ) : null}
            <span className="rounded-sm border border-white/35 bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
              {contentKindLabel(kind)}
            </span>
            <span className="rounded-sm bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm">
              {deadlineLabel(scholarship.apply_end_date)}
            </span>
          </div>

          <div>
            <p className="text-xs font-medium text-white/70 sm:text-sm">
              {scholarship.organization}
            </p>
            <h2
              id="home-hero-heading"
              className="mt-1 text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl md:text-4xl"
            >
              {displayName}
            </h2>
            <p className="mt-2 line-clamp-2 text-sm text-white/75 sm:text-base">
              {supportAmount}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href={href}
              onClick={onAnnouncementClick}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-cream active:scale-[0.98]"
            >
              <svg
                className="h-4 w-4"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path d="M8.25 5.25v13.5l11.25-6.75L8.25 5.25z" />
              </svg>
              자세히 보기
            </Link>
            {showMatchedCta ? (
              <Link
                href="/matched"
                className="inline-flex items-center rounded-full border border-white/35 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                맞춤 공고 더보기
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
