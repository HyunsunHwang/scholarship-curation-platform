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

type HomeSearchContextValue = {
  query: string;
  deferredQuery: string;
  setQuery: (query: string) => void;
};

const HomeSearchContext = createContext<HomeSearchContextValue | null>(null);

export function HomeSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQueryState] = useState("");
  const deferredQuery = useDeferredValue(query);
  const setQuery = useCallback((next: string) => {
    setQueryState(next);
  }, []);

  const value = useMemo(
    () => ({ query, deferredQuery, setQuery }),
    [query, deferredQuery, setQuery]
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
