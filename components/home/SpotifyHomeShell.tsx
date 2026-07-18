"use client";

import type { ReactNode } from "react";
import type { CardScholarship } from "@/components/ScholarshipCard";
import AnnouncementModalProvider from "@/components/announcement/AnnouncementModalProvider";
import { HomeBookmarkProvider } from "@/components/home/HomeBookmarkContext";
import HomeFeed from "./HomeFeed";

export default function SpotifyHomeShell({
  scholarships,
  afterHero = null,
  afterTop10 = null,
}: {
  scholarships: CardScholarship[];
  afterHero?: ReactNode;
  afterTop10?: ReactNode;
}) {
  return (
    <AnnouncementModalProvider>
      <HomeBookmarkProvider>
        <HomeFeed
          scholarships={scholarships}
          afterHero={afterHero}
          afterTop10={afterTop10}
        />
      </HomeBookmarkProvider>
    </AnnouncementModalProvider>
  );
}
