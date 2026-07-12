import type { BenefitCategoryId, BenefitHighlight } from "@/lib/benefit-categories";
import { BENEFIT_ICON_PATHS } from "@/lib/benefit-categories";

function BenefitIcon({ id }: { id: BenefitCategoryId }) {
  return (
    <svg
      className="h-6 w-6 shrink-0 text-ink"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={BENEFIT_ICON_PATHS[id]} />
    </svg>
  );
}

/**
 * 에어비앤비 amenities 스타일: 아이콘 + 짧은 키워드 2열 그리드
 */
export default function BenefitHighlights({
  benefits,
  emptyLabel = "안내된 혜택 정보가 없습니다.",
}: {
  benefits: BenefitHighlight[];
  emptyLabel?: string;
}) {
  if (benefits.length === 0) {
    return (
      <div className="mt-6 border-t border-gray-100 pt-6">
        <p className="text-sm text-ink/45">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ul className="mt-6 grid grid-cols-1 gap-x-8 gap-y-5 border-t border-gray-100 pt-6 sm:grid-cols-2">
      {benefits.map((b) => (
        <li key={b.id} className="flex min-w-0 items-center gap-3">
          <BenefitIcon id={b.id} />
          <span className="wrap-break-word text-[15px] font-medium leading-snug text-ink">
            {b.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
