"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cardBookmarkKey } from "@/lib/bookmark-keys";
import type { CardScholarship } from "@/components/ScholarshipCard";

type HomeBookmarkContextValue = {
  isBookmarked: (item: CardScholarship) => boolean;
  hydrate: (keys: string[]) => void;
};

const HomeBookmarkContext = createContext<HomeBookmarkContextValue>({
  isBookmarked: () => false,
  hydrate: () => {},
});

export function HomeBookmarkProvider({ children }: { children: ReactNode }) {
  const [keys, setKeys] = useState<string[]>([]);
  const keySet = useMemo(() => new Set(keys), [keys]);

  const isBookmarked = useCallback(
    (item: CardScholarship) => keySet.has(cardBookmarkKey(item)),
    [keySet]
  );

  const hydrate = useCallback((next: string[]) => {
    setKeys(next);
  }, []);

  const value = useMemo(
    () => ({ isBookmarked, hydrate }),
    [isBookmarked, hydrate]
  );

  return (
    <HomeBookmarkContext.Provider value={value}>
      {children}
    </HomeBookmarkContext.Provider>
  );
}

/** 개인화 로드 후 북마크 키를 Provider에 주입 */
export function HomeBookmarkHydrator({ keys }: { keys: string[] }) {
  const { hydrate } = useContext(HomeBookmarkContext);
  useEffect(() => {
    hydrate(keys);
  }, [keys, hydrate]);
  return null;
}

export function useHomeBookmarkChecker() {
  return useContext(HomeBookmarkContext).isBookmarked;
}
