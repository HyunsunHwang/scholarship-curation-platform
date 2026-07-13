"use client";

import { useEffect, useState } from "react";
import type { CardScholarship } from "@/components/ScholarshipCard";
import HomeFeed from "./HomeFeed";
import LibrarySidebar from "./LibrarySidebar";

const LIBRARY_LEFT_KEY = "janghakssam:library-left-open";

function readLibraryLeftOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(LIBRARY_LEFT_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

export default function SpotifyHomeShell({
  scholarships,
  bookmarkedKeys,
  bookmarkedScholarships = [],
  isLoggedIn,
}: {
  scholarships: CardScholarship[];
  bookmarkedKeys: string[];
  bookmarkedScholarships?: CardScholarship[];
  isLoggedIn: boolean;
}) {
  const [leftOpen, setLeftOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLeftOpen(readLibraryLeftOpen());
    setHydrated(true);
  }, []);

  useEffect(() => {
    const open = () => setLibraryLeftOpen(true);
    window.addEventListener("janghakssam:open-library", open);
    return () => window.removeEventListener("janghakssam:open-library", open);
  }, []);

  function setLibraryLeftOpen(next: boolean) {
    setLeftOpen(next);
    try {
      window.localStorage.setItem(LIBRARY_LEFT_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  return (
    <div className="w-full pb-10 pt-4 sm:pt-5">
      <div className="flex items-start gap-3 xl:gap-4 lg:pl-2 xl:pl-3">
        {/* 데스크톱만: 왼쪽 라이브러리 (접기/펼치기) — 모바일에서는 숨김 */}
        <div
          className={`sticky top-18 hidden shrink-0 self-start transition-[width] duration-200 lg:block ${
            leftOpen
              ? "h-[calc(100dvh-5.5rem)] w-[240px] xl:w-[260px]"
              : "h-auto w-14"
          }`}
        >
          {leftOpen ? (
            <LibrarySidebar
              isLoggedIn={isLoggedIn}
              bookmarkedScholarships={bookmarkedScholarships}
              variant="sidebar"
              onCollapse={() => setLibraryLeftOpen(false)}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200/80 bg-white py-3">
              <button
                type="button"
                onClick={() => setLibraryLeftOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-ink/70 transition-colors hover:bg-beige hover:text-ink"
                aria-label="내 라이브러리를 왼쪽에 열기"
                title="내 라이브러리 열기"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"
                  />
                </svg>
              </button>
              {hydrated ? (
                <span
                  className="text-[10px] font-semibold tracking-wide text-ink/45"
                  style={{ writingMode: "vertical-rl" }}
                >
                  내 라이브러리
                </span>
              ) : null}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 px-4 sm:px-6 lg:pr-8 lg:pl-1 xl:pr-10">
          <HomeFeed scholarships={scholarships} bookmarkedKeys={bookmarkedKeys} />
        </div>
      </div>
    </div>
  );
}
