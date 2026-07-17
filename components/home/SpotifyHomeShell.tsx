"use client";

import type { CardScholarship } from "@/components/ScholarshipCard";
import AnnouncementModalProvider from "@/components/announcement/AnnouncementModalProvider";
import type { HomeRail } from "@/lib/home-rails";
import HomeFeed from "./HomeFeed";

export default function SpotifyHomeShell({
  scholarships,
  bookmarkedKeys,
  forYou = [],
  urgentBookmarks = [],
  serverRecent = [],
  interestRails = [],
  campusRail = null,
  regionRail = null,
  collaborativeRail = null,
  userName = null,
  isLoggedIn,
  isOnboarded = false,
}: {
  scholarships: CardScholarship[];
  bookmarkedKeys: string[];
  forYou?: CardScholarship[];
  urgentBookmarks?: CardScholarship[];
  serverRecent?: CardScholarship[];
  interestRails?: HomeRail[];
  campusRail?: HomeRail | null;
  regionRail?: HomeRail | null;
  collaborativeRail?: HomeRail | null;
  userName?: string | null;
  isLoggedIn: boolean;
  isOnboarded?: boolean;
}) {
  return (
    <AnnouncementModalProvider>
      <div className="w-full px-4 pb-10 pt-4 sm:px-6 sm:pt-5 lg:px-10">
        <HomeFeed
          scholarships={scholarships}
          bookmarkedKeys={bookmarkedKeys}
          forYou={forYou}
          urgentBookmarks={urgentBookmarks}
          serverRecent={serverRecent}
          interestRails={interestRails}
          campusRail={campusRail}
          regionRail={regionRail}
          collaborativeRail={collaborativeRail}
          userName={userName}
          isLoggedIn={isLoggedIn}
          isOnboarded={isOnboarded}
        />
      </div>
    </AnnouncementModalProvider>
  );
}
