"use client";

import type { CardScholarship } from "@/components/ScholarshipCard";
import HomeFeed from "./HomeFeed";

export default function SpotifyHomeShell({
  scholarships,
  bookmarkedIds,
}: {
  scholarships: CardScholarship[];
  bookmarkedIds: number[];
}) {
  return (
    <div className="mx-auto w-full max-w-[1760px] px-4 pb-10 pt-4 sm:px-6 sm:pt-5 lg:px-10">
      <HomeFeed scholarships={scholarships} bookmarkedIds={bookmarkedIds} />
    </div>
  );
}
