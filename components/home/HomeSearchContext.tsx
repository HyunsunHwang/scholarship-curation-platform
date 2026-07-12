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

type HomeSearchContextValue = {
  query: string;
  deferredQuery: string;
  setQuery: (query: string) => void;
  category: ContentCategoryKey;
  setCategory: (category: ContentCategoryKey) => void;
};

const HomeSearchContext = createContext<HomeSearchContextValue | null>(null);

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

  const value = useMemo(
    () => ({ query, deferredQuery, setQuery, category, setCategory }),
    [query, deferredQuery, setQuery, category, setCategory]
  );

  return (
    <HomeSearchContext.Provider value={value}>
      {children}
    </HomeSearchContext.Provider>
  );
}

export function useHomeSearch() {
  const ctx = useContext(HomeSearchContext);
  if (!ctx) {
    throw new Error("useHomeSearch must be used within HomeSearchProvider");
  }
  return ctx;
}
