"use client";

import { HOME_CATEGORY_TABS } from "@/lib/home-category-tabs";
import { useHomeSearchFilters } from "@/components/home/HomeSearchContext";

export default function HomeCategoryChips() {
  const { category, setCategory } = useHomeSearchFilters();

  return (
    <nav
      aria-label="홈 카테고리"
      className="w-full px-4 pt-1 pb-3 sm:px-6 sm:pb-4 lg:px-10"
    >
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        {HOME_CATEGORY_TABS.map((tab) => {
          const active = category === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(tab.key)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition active:scale-[0.98] sm:px-5 ${
                active
                  ? "bg-brand text-white shadow-sm shadow-brand/25"
                  : "border border-ink/10 bg-white text-ink/70 hover:border-brand/25 hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
