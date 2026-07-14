"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

type MobileBottomNavProps = {
  isLoggedIn: boolean;
  onMessagesClick: () => void;
};

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
      />
    </svg>
  );
}

function LibraryIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3"
      />
    </svg>
  );
}

function ExploreIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9 9 0 100-18 9 9 0 000 18z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.91 8.09l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"
      />
    </svg>
  );
}

function MessagesIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.1 48.1 0 005.714-.215c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
      />
    </svg>
  );
}

function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
      />
    </svg>
  );
}

const tabClass = (active: boolean) =>
  `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition-colors ${
    active ? "text-brand" : "text-ink/45"
  }`;

export default function MobileBottomNav({
  isLoggedIn,
  onMessagesClick,
}: MobileBottomNavProps) {
  const pathname = usePathname();
  const profileHref = isLoggedIn ? "/mypage" : "/auth";
  const homeActive = pathname === "/";
  const libraryActive = pathname.startsWith("/library");
  const browseActive = pathname.startsWith("/browse");
  const profileActive =
    pathname.startsWith("/mypage") || pathname.startsWith("/auth");

  useEffect(() => {
    document.documentElement.classList.add("has-mobile-tabbar");
    return () => {
      document.documentElement.classList.remove("has-mobile-tabbar");
    };
  }, []);

  return (
    <nav
      aria-label="모바일 주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200/90 bg-white/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur supports-backdrop-filter:bg-white/90 md:hidden"
    >
      <div className="mx-auto flex h-14 max-w-lg items-stretch">
        <Link
          href="/"
          aria-current={homeActive ? "page" : undefined}
          className={tabClass(homeActive)}
        >
          <HomeIcon className="h-[22px] w-[22px]" />
          <span className="text-[10px] font-semibold leading-none">홈</span>
        </Link>

        <Link
          href="/library"
          aria-current={libraryActive ? "page" : undefined}
          className={tabClass(libraryActive)}
        >
          <LibraryIcon className="h-[22px] w-[22px]" />
          <span className="text-[10px] font-semibold leading-none">라이브러리</span>
        </Link>

        <Link
          href="/browse"
          aria-current={browseActive ? "page" : undefined}
          className={tabClass(browseActive)}
        >
          <ExploreIcon className="h-[22px] w-[22px]" />
          <span className="text-[10px] font-semibold leading-none">탐색</span>
        </Link>

        <button
          type="button"
          onClick={onMessagesClick}
          className={tabClass(false)}
        >
          <MessagesIcon className="h-[22px] w-[22px]" />
          <span className="text-[10px] font-semibold leading-none">메세지</span>
        </button>

        <Link
          href={profileHref}
          aria-current={profileActive ? "page" : undefined}
          className={tabClass(profileActive)}
        >
          <ProfileIcon className="h-[22px] w-[22px]" />
          <span className="text-[10px] font-semibold leading-none">프로필</span>
        </Link>
      </div>
    </nav>
  );
}
