"use client";

import { useMemo, useState } from "react";
import {
  SKILL_CATALOG,
  SKILL_MAX,
  type SkillName,
} from "@/lib/skills";

type Props = {
  value: SkillName[];
  onChange: (next: SkillName[]) => void;
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

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-4.35-4.35m1.6-5.15a6.75 6.75 0 11-13.5 0 6.75 6.75 0 0113.5 0z"
      />
    </svg>
  );
}

export default function SkillPicker({
  value,
  onChange,
  max = SKILL_MAX,
  showSelected = true,
}: Props) {
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(value), [value]);
  const atLimit = value.length >= max;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SKILL_CATALOG as readonly SkillName[];
    return (SKILL_CATALOG as readonly SkillName[]).filter((name) =>
      name.toLowerCase().includes(q)
    );
  }, [query]);

  function toggle(name: SkillName) {
    if (selectedSet.has(name)) {
      onChange(value.filter((v) => v !== name));
      return;
    }
    if (atLimit) return;
    onChange([...value, name]);
  }

  function remove(name: SkillName) {
    onChange(value.filter((v) => v !== name));
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4">
        <label className="relative block">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink/35">
            <SearchIcon className="h-4 w-4" />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="찾으시는 스킬을 입력해주세요"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15"
            autoComplete="off"
          />
        </label>

        <div className="mt-3 max-h-56 overflow-y-auto overscroll-contain pr-1">
          {filtered.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-ink/40">
              검색 결과가 없어요.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filtered.map((name) => {
                const selected = selectedSet.has(name);
                const disabled = !selected && atLimit;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggle(name)}
                    disabled={disabled}
                    aria-pressed={selected}
                    className={`${chipBase} ${
                      selected
                        ? chipActive
                        : disabled
                          ? chipDisabled
                          : chipIdle
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showSelected ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink/40">
            {value.length} / {max}
          </span>
          {value.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => remove(name)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-ink/80 bg-beige px-3 py-1.5 text-sm font-medium text-ink"
              aria-label={`${name} 제거`}
            >
              {name}
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
