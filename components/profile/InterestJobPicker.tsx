"use client";

import { useMemo, useState } from "react";
import {
  INTEREST_CATEGORIES,
  INTEREST_SUBCATEGORIES,
  interestJobLabel,
  type InterestCategoryId,
  type InterestJobId,
} from "@/lib/interestCategories";

type Props = {
  value: InterestJobId[];
  onChange: (next: InterestJobId[]) => void;
  max?: number;
  /** 선택된 칩을 박스 아래에 표시 (기본 true) */
  showSelected?: boolean;
};

const chipBase =
  "rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors";
const chipIdle =
  "border-gray-200 bg-white text-ink/70 hover:border-brand/40 hover:text-brand";
const chipActive = "border-ink/80 bg-beige text-ink";
const chipDisabled = "cursor-not-allowed border-gray-100 bg-gray-50 text-ink/30";

export default function InterestJobPicker({
  value,
  onChange,
  max = 5,
  showSelected = true,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<InterestCategoryId>(
    INTEREST_CATEGORIES[0].id
  );

  const selectedSet = useMemo(() => new Set(value), [value]);
  const atLimit = value.length >= max;
  const subs = INTEREST_SUBCATEGORIES[activeCategory];

  function toggleJob(id: InterestJobId) {
    if (selectedSet.has(id)) {
      onChange(value.filter((v) => v !== id));
      return;
    }
    if (atLimit) return;
    onChange([...value, id]);
  }

  function removeJob(id: InterestJobId) {
    onChange(value.filter((v) => v !== id));
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {INTEREST_CATEGORIES.map((cat) => {
            const active = cat.id === activeCategory;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                aria-pressed={active}
                className={`${chipBase} ${active ? chipActive : chipIdle}`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="my-3 border-t border-gray-100" />

        <div className="flex flex-wrap gap-2">
          {subs.map((job) => {
            const id = job.id as InterestJobId;
            const selected = selectedSet.has(id);
            const disabled = !selected && atLimit;
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleJob(id)}
                disabled={disabled}
                aria-pressed={selected}
                className={`${chipBase} ${
                  selected ? chipActive : disabled ? chipDisabled : chipIdle
                }`}
              >
                {job.label}
              </button>
            );
          })}
        </div>
      </div>

      {showSelected ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink/40">
            {value.length} / {max}
          </span>
          {value.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => removeJob(id)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-ink/80 bg-beige px-3 py-1.5 text-sm font-medium text-ink"
              aria-label={`${interestJobLabel(id)} 제거`}
            >
              {interestJobLabel(id)}
              <span aria-hidden className="text-ink/50">
                ×
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
