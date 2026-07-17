"use client";

import type { ReactNode } from "react";
import type { CardScholarship } from "@/components/ScholarshipCard";
import AnnouncementModalProvider from "@/components/announcement/AnnouncementModalProvider";
import { HomeBookmarkProvider } from "@/components/home/HomeBookmarkContext";
import HomeFeed from "./HomeFeed";

export default function SpotifyHomeShell({
  scholarships,
  isLoggedIn,
  afterHero = null,
  afterTop10 = null,
}: {
  scholarships: CardScholarship[];
  isLoggedIn: boolean;
  afterHero?: ReactNode;
  afterTop10?: ReactNode;
}) {
  return (
    <AnnouncementModalProvider>
      <HomeBookmarkProvider>
        <div className="w-full px-4 pb-10 pt-4 sm:px-6 sm:pt-5 lg:px-10">
          <HomeFeed
            scholarships={scholarships}
            isLoggedIn={isLoggedIn}
            afterHero={afterHero}
            afterTop10={afterTop10}
          />
        </div>
      </HomeBookmarkProvider>
    </AnnouncementModalProvider>
  );
}
