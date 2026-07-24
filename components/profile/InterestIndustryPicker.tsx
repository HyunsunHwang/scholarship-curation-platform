"use client";

import {
  INTEREST_INDUSTRIES,
  INTEREST_INDUSTRY_MAX,
  type InterestIndustryId,
} from "@/lib/interestIndustries";

type Props = {
  value: InterestIndustryId[];
  onChange: (next: InterestIndustryId[]) => void;
  max?: number;
};

const chipBase =
  "rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors text-left";
const chipIdle =
  "border-gray-200 bg-white text-ink/70 hover:border-brand/40 hover:text-brand";
const chipActive = "border-ink/80 bg-beige text-ink";
const chipDisabled = "cursor-not-allowed border-gray-100 bg-gray-50 text-ink/30";

export default function InterestIndustryPicker({
  value,
  onChange,
  max = INTEREST_INDUSTRY_MAX,
}: Props) {
  const selected = new Set(value);
  const atLimit = value.length >= max;

  function toggle(id: InterestIndustryId) {
    if (selected.has(id)) {
      onChange(value.filter((v) => v !== id));
      return;
    }
    if (atLimit) return;
    onChange([...value, id]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {INTEREST_INDUSTRIES.map((ind) => {
          const on = selected.has(ind.id);
          const disabled = !on && atLimit;
          return (
            <button
              key={ind.id}
              type="button"
              title={ind.hint}
              onClick={() => toggle(ind.id)}
              disabled={disabled}
              aria-pressed={on}
              className={`${chipBase} ${
                on ? chipActive : disabled ? chipDisabled : chipIdle
              }`}
            >
              {ind.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] font-medium text-ink/40">
        {value.length} / {max} · 선택 사항
      </p>
    </div>
  );
}
