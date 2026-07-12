import type { BenefitCategoryId, BenefitHighlight } from "@/lib/benefit-categories";
import { BENEFIT_ICON_PATHS } from "@/lib/benefit-categories";

/** 노란색 트로피 (총상금 강조용) */
function GoldTrophyIcon() {
  return (
    <svg
      className="h-6 w-6 shrink-0 text-amber-400"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M8.25 3a.75.75 0 00-.75.75v.75H6.75A2.25 2.25 0 004.5 6.75v.75a5.25 5.25 0 004.317 5.162 3.751 3.751 0 001.433 2.338V16.5h-1.5a.75.75 0 000 1.5h6a.75.75 0 000-1.5h-1.5v-1.5a3.751 3.751 0 001.433-2.338A5.25 5.25 0 0019.5 7.5v-.75A2.25 2.25 0 0017.25 4.5H16.5v-.75a.75.75 0 00-.75-.75h-7.5zM7.5 6v.75h9V6h.75a.75.75 0 01.75.75v.75a3.75 3.75 0 01-7.5 0V6.75A.75.75 0 016.75 6H7.5zM9 19.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function BenefitIcon({
  id,
  accent,
}: {
  id: BenefitCategoryId;
  accent?: BenefitHighlight["accent"];
}) {
  if (id === "prize" && accent === "gold") {
    return <GoldTrophyIcon />;
  }

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
        <li key={`${b.id}-${b.label}`} className="flex min-w-0 items-center gap-3">
          <BenefitIcon id={b.id} accent={b.accent} />
          <span className="wrap-break-word text-[15px] font-medium leading-snug text-ink">
            {b.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
