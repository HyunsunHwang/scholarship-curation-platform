import Link from "next/link";
import Image from "next/image";
import CardBookmarkButton from "@/components/CardBookmarkButton";
import { daysUntilApplyDeadlineKorea, isAlwaysOpenRecruitment } from "@/lib/scholarship-dates";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { formatSupportAmount } from "@/lib/support-amount";
import { contentKindHref } from "@/lib/content-categories";

export type CardScholarship = {
  id: number;
  name: string;
  organization: string;
  institution_type: string;
  support_types: string[];
  support_amount_text?: string | null;
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
};

const institutionGradient: Record<string, string> = {
  국가기관: "from-[#ff3131] to-[#c00000]",
  공공기관: "from-[#b3e4fb] to-[#5ab8e8]",
  지방자치단체: "from-[#fea276] to-[#e06030]",
  기업: "from-violet-400 to-purple-600",
  재단법인: "from-emerald-400 to-teal-600",
  학교법인: "from-[#fbeca8] to-[#f0c040]",
  "언론/방송": "from-rose-400 to-red-600",
  종교단체: "from-[#fbeca8] to-[#fea276]",
  기타: "from-stone-300 to-stone-500",
};

function formatDeadline(dateStr: string): string {
  if (isAlwaysOpenRecruitment(dateStr)) return "상시모집";
  const days = daysUntilApplyDeadlineKorea(dateStr);
  if (days < 0) return "마감됨";
  if (days === 0) return "오늘 마감";
  if (days <= 7) return `D-${days} · 마감 임박`;
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m)}월 ${parseInt(d)}일 마감`;
}

function deadlineColor(dateStr: string): string {
  if (isAlwaysOpenRecruitment(dateStr)) return "text-brand";
  const days = daysUntilApplyDeadlineKorea(dateStr);
  if (days < 0) return "text-ink/40";
  if (days <= 7) return "text-brand";
  if (days <= 30) return "text-[#e07030]";
  return "text-ink/50";
}

export default function ScholarshipCard({
  scholarship,
  initialBookmarked = false,
}: {
  scholarship: CardScholarship;
  initialBookmarked?: boolean;
}) {
  const gradient =
    institutionGradient[scholarship.institution_type] ?? "from-stone-300 to-stone-500";

  const color = deadlineColor(scholarship.apply_end_date);
  const deadlineLabel = formatDeadline(scholarship.apply_end_date);
  const displayName = cleanScholarshipName(scholarship.name);
  const supportAmount = formatSupportAmount(scholarship.support_amount_text);
  const href = contentKindHref(scholarship.content_kind, scholarship.id);
  const hideBookmark =
    scholarship.content_kind === "contest" ||
    scholarship.content_kind === "education" ||
    scholarship.content_kind === "activity";
  const kind = scholarship.content_kind ?? "scholarship";
  const kindLabel =
    kind === "contest"
      ? "공모전"
      : kind === "education"
        ? "교육"
        : kind === "activity"
          ? "대외활동"
          : "장학금";
  const kindBadgeClass =
    kind === "contest"
      ? "border-sky-600 text-sky-700"
      : kind === "education"
        ? "border-emerald-600 text-emerald-700"
        : kind === "activity"
          ? "border-violet-600 text-violet-700"
          : "border-brand text-brand";

  return (
    <div className="group flex flex-col">
      <Link
        href={href}
        className="relative block aspect-2/3 w-full overflow-hidden rounded-xl sm:rounded-2xl"
      >
        {scholarship.poster_image_url ? (
          <Image
            src={scholarship.poster_image_url}
            alt={displayName}
            fill
            sizes="(max-width: 639px) 138px, (max-width: 767px) 156px, (max-width: 1023px) 172px, 188px"
            loading="lazy"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            className={`h-full w-full bg-linear-to-br ${gradient} flex items-end p-4 transition-transform duration-300 group-hover:scale-105`}
          >
            <span className="inline-flex items-center rounded-full border border-white/30 bg-white/20 px-2.5 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
              {scholarship.institution_type}
            </span>
          </div>
        )}

        <span
          className={`absolute left-2 top-2 z-10 inline-flex items-center rounded-sm border bg-white/95 px-1.5 py-[3px] text-[10px] font-semibold leading-none shadow-sm backdrop-blur-sm sm:left-3 sm:top-3 sm:px-2 sm:text-[11px] ${kindBadgeClass}`}
          aria-label={kindLabel}
        >
          {kindLabel}
        </span>

        <div className="absolute bottom-2 left-2 max-w-[78%] sm:bottom-3 sm:left-3 sm:max-w-[70%]">
          <span className="inline-block max-w-full truncate rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm sm:px-2.5 sm:text-xs">
            {scholarship.organization}
          </span>
        </div>

        {!hideBookmark && (
          <CardBookmarkButton
            scholarshipId={scholarship.id}
            initialBookmarked={initialBookmarked}
          />
        )}
      </Link>

      <Link href={href} className="mt-2 flex flex-col gap-0.5 sm:mt-3">
        <div className="flex min-w-0 items-start gap-1.5 sm:gap-2">
          {kind === "scholarship" &&
            (scholarship.is_advertisement || scholarship.is_recommended) && (
              <span
                className={`mt-[2px] inline-flex shrink-0 items-center rounded-sm bg-white px-1.5 py-[3px] text-[10px] font-semibold leading-none sm:mt-0.5 sm:px-2 sm:text-[11px] ${
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
            )}
          <p className="min-w-0 flex-1 text-xs font-semibold leading-snug text-ink line-clamp-2 group-hover:text-brand transition-colors sm:text-sm">
            {displayName}
          </p>
        </div>
        <p className={`mt-0.5 text-[11px] font-medium sm:text-xs ${color}`}>
          {deadlineLabel}
        </p>
        <p
          className="mt-1 truncate text-xs font-bold text-ink sm:text-sm"
          title={supportAmount}
        >
          {supportAmount}
        </p>
      </Link>
    </div>
  );
}
