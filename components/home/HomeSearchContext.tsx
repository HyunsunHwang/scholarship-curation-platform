"use client";

import {
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ContentCategoryKey } from "@/lib/content-categories";

type HomeSearchQueryValue = {
  query: string;
  setQuery: (query: string) => void;
};

type HomeSearchFilterValue = {
  deferredQuery: string;
  category: ContentCategoryKey;
  setCategory: (category: ContentCategoryKey) => void;
};

const HomeSearchQueryContext = createContext<HomeSearchQueryValue | null>(null);
const HomeSearchFilterContext = createContext<HomeSearchFilterValue | null>(
  null
);

export function HomeSearchProvider({
  children,
  initialQuery = "",
}: {
  children: ReactNode;
  initialQuery?: string;
}) {
  const [query, setQueryState] = useState(initialQuery);
  const [category, setCategoryState] = useState<ContentCategoryKey>("all");
  const deferredQuery = useDeferredValue(query);
  const setQuery = useCallback((next: string) => {
    setQueryState(next);
  }, []);
  const setCategory = useCallback((next: ContentCategoryKey) => {
    setCategoryState(next);
  }, []);

  // 타이핑 시 query만 바뀌고 filter(deferredQuery)는 나중에 갱신 → 피드 리렌더 분리
  const queryValue = useMemo(
    () => ({ query, setQuery }),
    [query, setQuery]
  );
  const filterValue = useMemo(
    () => ({ deferredQuery, category, setCategory }),
    [deferredQuery, category, setCategory]
  );

  return (
    <HomeSearchQueryContext.Provider value={queryValue}>
      <HomeSearchFilterContext.Provider value={filterValue}>
        {children}
      </HomeSearchFilterContext.Provider>
    </HomeSearchQueryContext.Provider>
  );
}

/** 검색 입력창 전용 — 키 입력마다 피드가 같이 리렌더되지 않음 */
export function useHomeSearchQuery() {
  const ctx = useContext(HomeSearchQueryContext);
  if (!ctx) {
    throw new Error("useHomeSearchQuery must be used within HomeSearchProvider");
  }
  return ctx;
}

/** 피드 필터용 — deferredQuery / category */
export function useHomeSearchFilters() {
  const ctx = useContext(HomeSearchFilterContext);
  if (!ctx) {
    throw new Error(
      "useHomeSearchFilters must be used within HomeSearchProvider"
    );
  }
  return ctx;
}

/** @deprecated 가능하면 useHomeSearchQuery / useHomeSearchFilters 사용 */
export function useHomeSearch() {
  return {
    ...useHomeSearchQuery(),
    ...useHomeSearchFilters(),
  };
}
