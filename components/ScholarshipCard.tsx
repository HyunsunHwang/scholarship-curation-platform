"use client";

import { memo } from "react";
import Link from "next/link";
import Image from "next/image";
import CardBookmarkButton from "@/components/CardBookmarkButton";
import { useAnnouncementLinkClick } from "@/components/announcement/AnnouncementModalProvider";
import { daysUntilApplyDeadlineKorea, isAlwaysOpenRecruitment } from "@/lib/scholarship-dates";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { resolveCardSupportLine } from "@/lib/support-amount";
import { contentKindHref } from "@/lib/content-categories";

export type CardScholarship = {
  id: number;
  name: string;
  organization: string;
  institution_type: string;
  support_types: string[];
  support_amount_text?: string | null;
  /** 공모전·교육·대외활동 혜택 키워드 (목록 하단 폴백용) */
  benefits?: string[] | null;
  /** additionalBenefit 등 */
  benefit_note?: string | null;
  /** 목록 키워드 보강용 원문 스니펫 */
  benefit_notice_text?: string | null;
  /**
   * 서버에서 원문 전체 기준으로 미리 계산한 카드 하단 문구.
   * (짧은 스니펫만으로는 총상금이 누락되는 경우 방지)
   */
  card_support_line?: string | null;
  apply_end_date: string;
  poster_image_url?: string | null;
  created_at: string;
  view_count?: number | null;
  scrap_count?: number | null;
  scope?: "campus" | "external";
  /** 홈·목록에서 상단 고정 정렬용 (맞춤 페이지 등에서도 동일 규칙 적용 시) */
  is_recommended?: boolean;
  recommended_sort_order?: number | null;
  is_advertisement?: boolean;
  /** 홈 카테고리 필터용. 기본 scholarship */
  content_kind?: "scholarship" | "contest" | "education" | "activity";
  /** 공모전·교육·대외활동 관심 태그 (interestCategories) */
  interest_categories?: string[] | null;
  /** 공모전·교육·대외활동 관심 산업 태그 */
  interest_industries?: string[] | null;
  /** 장학금 계열 코드 (인문|사회|교육|공학|자연|의약|예체능) */
  qual_field_codes?: string[] | null;
  qual_university?: string[] | null;
  qual_region?: string[] | null;
  qual_school_location?: string[] | null;
};

const institutionGradient: Record<string, string> = {
  국가기관: "from-[#020080] to-[#01004d]",
  공공기관: "from-[#3d5cff] to-[#020080]",
  지방자치단체: "from-[#8019de] to-[#4e0f8a]",
  기업: "from-[#a35ef0] to-[#8019de]",
  재단법인: "from-[#1a3a8a] to-[#0b0f14]",
  학교법인: "from-[#6b7cff] to-[#020080]",
  "언론/방송": "from-[#8019de] to-[#020080]",
  종교단체: "from-[#c48ef5] to-[#8019de]",
  기타: "from-[#5c6570] to-[#0b0f14]",
};

/** 카드 뱃지용: D-n / D-DAY / 상시 / 마감 */
function formatDeadlineBadge(dateStr: string): string {
  if (isAlwaysOpenRecruitment(dateStr)) return "상시";
  const days = daysUntilApplyDeadlineKorea(dateStr);
  if (days < 0) return "마감";
  if (days === 0) return "D-DAY";
  return `D-${days}`;
}

function ScholarshipCard({
  scholarship,
  initialBookmarked = false,
}: {
  scholarship: CardScholarship;
  initialBookmarked?: boolean;
}) {
  const gradient =
    institutionGradient[scholarship.institution_type] ?? "from-stone-300 to-stone-500";

  const deadlineBadge = formatDeadlineBadge(scholarship.apply_end_date);
  const displayName = cleanScholarshipName(scholarship.name);
  const supportAmount = resolveCardSupportLine({
    contentKind: scholarship.content_kind,
    supportAmountText: scholarship.support_amount_text,
    benefits: scholarship.benefits,
    additionalNote: scholarship.benefit_note,
    noticeText: scholarship.benefit_notice_text,
    name: scholarship.name,
    cardSupportLine: scholarship.card_support_line,
  });
  const href = contentKindHref(scholarship.content_kind, scholarship.id);
  const kind = scholarship.content_kind ?? "scholarship";
  const onAnnouncementClick = useAnnouncementLinkClick(kind, scholarship.id);
  const isContestLike =
    kind === "contest" || kind === "education" || kind === "activity";
  const kindLabel =
    kind === "contest"
      ? "공모전"
      : kind === "education"
        ? "교육"
        : kind === "activity"
          ? "대외활동"
          : "장학금";
  const kindBadgeLabel = `${deadlineBadge} · ${kindLabel}`;
  const kindBadgeClass =
    kind === "contest"
      ? "border-sky-600 text-sky-700"
      : kind === "education"
        ? "border-emerald-600 text-emerald-700"
        : kind === "activity"
          ? "border-violet-600 text-violet-700"
          : "border-brand text-brand";
  const showPromoBadge =
    kind === "scholarship" &&
    (scholarship.is_advertisement || scholarship.is_recommended);

  return (
    <div className="group">
      <Link
        href={href}
        onClick={onAnnouncementClick}
        className="relative block aspect-2/3 w-full overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5 transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-md sm:rounded-2xl"
      >
        {scholarship.poster_image_url ? (
          <Image
            src={scholarship.poster_image_url}
            alt={displayName}
            fill
            sizes="(max-width: 639px) 138px, (max-width: 767px) 156px, (max-width: 1023px) 172px, 188px"
            loading="lazy"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className={`flex h-full w-full items-end bg-linear-to-br p-4 ${gradient}`}
          >
            <span className="inline-flex items-center rounded-full border border-white/40 bg-black/45 px-2.5 py-0.5 text-xs font-semibold text-white">
              {scholarship.institution_type}
            </span>
          </div>
        )}

        {/* 하단 텍스트 가독용 그라데이션 */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[55%] bg-linear-to-t from-black/80 via-black/40 to-transparent"
        />

        <span
          className={`absolute left-2 top-2 z-10 inline-flex max-w-[calc(100%-2.5rem)] items-center truncate rounded-sm border bg-white/95 px-1.5 py-0.75 text-[10px] font-semibold leading-none shadow-sm backdrop-blur-sm sm:left-3 sm:top-3 sm:max-w-[calc(100%-3rem)] sm:px-2 sm:text-[11px] ${kindBadgeClass}`}
          aria-label={kindBadgeLabel}
        >
          {kindBadgeLabel}
        </span>

        <CardBookmarkButton
          scholarshipId={scholarship.id}
          initialBookmarked={initialBookmarked}
          bookmarkTarget={isContestLike ? "contest" : "scholarship"}
        />

        <div className="absolute inset-x-0 bottom-0 z-10 px-2.5 pb-2.5 pt-8 sm:px-3 sm:pb-3">
          {showPromoBadge ? (
            <span
              className={`mb-1.5 inline-flex items-center rounded-sm bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold leading-none shadow-sm ${
                scholarship.is_advertisement
                  ? "border border-amber-500 text-amber-600"
                  : "border border-fuchsia-600 text-fuchsia-600"
              }`}
              aria-label={
                scholarship.is_advertisement ? "광고 공고" : "추천 장학금"
              }
            >
              {scholarship.is_advertisement ? "광고" : "추천"}
            </span>
          ) : null}
          <p
            className="line-clamp-2 text-[12px] font-bold leading-snug tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] sm:text-[13px]"
            title={displayName}
          >
            {displayName}
          </p>
          {supportAmount ? (
            <p
              className="mt-1 truncate text-[10px] font-medium leading-snug text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] sm:text-[11px]"
              title={supportAmount}
            >
              {supportAmount}
            </p>
          ) : null}
        </div>
      </Link>
    </div>
  );
}

export default memo(ScholarshipCard);
