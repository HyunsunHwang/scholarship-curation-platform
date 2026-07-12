"use client";

import type { CardScholarship } from "@/components/ScholarshipCard";
import HomeFeed from "./HomeFeed";
import LibrarySidebar from "./LibrarySidebar";

export default function SpotifyHomeShell({
  scholarships,
  bookmarkedIds,
  bookmarkedScholarships = [],
  isLoggedIn,
}: {
  scholarships: CardScholarship[];
  bookmarkedIds: number[];
  bookmarkedScholarships?: CardScholarship[];
  isLoggedIn: boolean;
}) {
  return (
    <div className="w-full pb-10 pt-4 sm:pt-5">
      {/* 모바일: 라이브러리 */}
      <div className="mb-5 px-4 sm:px-6 lg:hidden">
        <LibrarySidebar
          isLoggedIn={isLoggedIn}
          bookmarkedScholarships={bookmarkedScholarships}
          variant="rail"
        />
      </div>

      <div className="flex items-start gap-3 xl:gap-4 lg:pl-2 xl:pl-3">
        {/* 데스크톱: 왼쪽 콤팩트 라이브러리 */}
        <div className="sticky top-18 hidden h-[calc(100dvh-5.5rem)] w-[240px] shrink-0 self-start lg:block xl:w-[260px]">
          <LibrarySidebar
            isLoggedIn={isLoggedIn}
            bookmarkedScholarships={bookmarkedScholarships}
            variant="sidebar"
          />
        </div>

        <div className="min-w-0 flex-1 px-4 sm:px-6 lg:pr-8 lg:pl-1 xl:pr-10">
          <HomeFeed scholarships={scholarships} bookmarkedIds={bookmarkedIds} />
        </div>
      </div>
    </div>
  );
}
