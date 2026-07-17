"use client";

import { useHomeSearchQuery } from "./HomeSearchContext";

export default function HomeSearchBar() {
  const { query, setQuery } = useHomeSearchQuery();

  return (
    <div className="relative w-full">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-4 w-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          />
        </svg>
      </span>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="어떤 공고를 찾고 계신가요?"
        className="w-full rounded-full border border-transparent bg-beige py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-ink/40 outline-none transition-shadow focus:border-brand/40 focus:bg-white focus:ring-2 focus:ring-brand/15"
        autoComplete="off"
        aria-label="공고 검색"
      />
    </div>
  );
}
