"use client";

import type { CardScholarship } from "@/components/ScholarshipCard";
import LibrarySidebar from "./LibrarySidebar";
import HomeFeed from "./HomeFeed";

export default function SpotifyHomeShell({
  isLoggedIn,
  scholarships,
  bookmarkedScholarships,
  bookmarkedIds,
}: {
  isLoggedIn: boolean;
  scholarships: CardScholarship[];
  bookmarkedScholarships: CardScholarship[];
  bookmarkedIds: number[];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 bg-beige p-2 sm:p-2.5 lg:flex-row lg:gap-2.5">
      <div className="flex h-[min(42vh,22rem)] shrink-0 flex-col lg:h-auto lg:w-[280px] xl:w-[320px]">
        <LibrarySidebar
          isLoggedIn={isLoggedIn}
          bookmarkedScholarships={bookmarkedScholarships}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <HomeFeed scholarships={scholarships} bookmarkedIds={bookmarkedIds} />
      </div>
    </div>
  );
}
