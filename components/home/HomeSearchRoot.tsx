"use client";

import type { ReactNode } from "react";
import { HomeSearchProvider } from "./HomeSearchContext";

/** 홈 검색바(TopNav)와 HomeFeed가 같은 검색 상태를 공유하도록 감싼다. */
export default function HomeSearchRoot({ children }: { children: ReactNode }) {
  return <HomeSearchProvider>{children}</HomeSearchProvider>;
}
