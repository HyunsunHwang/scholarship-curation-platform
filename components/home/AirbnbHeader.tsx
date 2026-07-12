"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BrandLogo from "@/components/BrandLogo";
import { logout } from "@/app/auth/actions";
import {
  CONTENT_CATEGORIES,
  type ContentCategoryKey,
} from "@/lib/content-categories";
import { useHomeSearch } from "./HomeSearchContext";

type AirbnbHeaderProps = {
  logoSrc?: string | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
  displayInitial: string;
  profileTitle: string;
  urgentBookmarkCount: number;
};

function CategoryIcon({
  categoryKey,
  className,
}: {
  categoryKey: ContentCategoryKey;
  className?: string;
}) {
  const common = {
    className,
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
  };

  switch (categoryKey) {
    case "all":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 12l9.75-9 9.75 9M4.5 10.5V21h5.25v-5.25h4.5V21H19.5V10.5"
          />
        </svg>
      );
    case "contest":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-4.5A3.375 3.375 0 0012.75 10.5h-1.5A3.375 3.375 0 007.5 14.25v4.5m9-11.25V6a2.25 2.25 0 00-2.25-2.25h-5.5A2.25 2.25 0 007.5 6v1.5"
          />
        </svg>
      );
    case "education":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
          />
        </svg>
      );
    case "activity":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
          />
        </svg>
      );
    case "scholarship":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.26 10.147a60.44 60.44 0 00-.491 6.347A48.63 48.63 0 0112 15.75c2.73 0 5.405.273 8.004.791a60.48 60.48 0 00-.491-6.347m-15.052 0a60.66 60.66 0 01-.514-3.63 48.73 48.73 0 0116.112 0c-.18 1.223-.34 2.434-.514 3.63m-15.052 0A50.02 50.02 0 0112 9.75c2.292 0 4.534.198 6.74.574"
          />
        </svg>
      );
    default:
      return null;
  }
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
  );
}

function CompactSearch({ className }: { className?: string }) {
  const { query, setQuery } = useHomeSearch();

  return (
    <div
      className={`flex items-center rounded-full border border-gray-200 bg-white shadow-md transition hover:shadow-lg focus-within:shadow-lg ${className ?? ""}`}
    >
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="공고 검색"
        className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm font-semibold text-ink placeholder:font-medium placeholder:text-ink/45 outline-none sm:px-5"
        autoComplete="off"
        aria-label="공고 검색"
      />
      <span
        className="hidden h-6 w-px shrink-0 bg-gray-200 sm:block"
        aria-hidden
      />
      <span className="hidden shrink-0 px-3 text-sm text-ink/45 sm:inline">
        키워드
      </span>
      <span className="m-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white">
        <SearchIcon className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

function CategoryTabs({ compact }: { compact?: boolean }) {
  const { category, setCategory } = useHomeSearch();

  return (
    <nav
      role="tablist"
      aria-label="공고 종류"
      className={`flex items-end justify-center gap-0.5 overflow-x-auto [scrollbar-width:none] sm:gap-1 ${
        compact ? "gap-0" : ""
      }`}
    >
      {CONTENT_CATEGORIES.map((tab) => {
        const active = category === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setCategory(tab.key)}
            className={`group relative flex shrink-0 flex-col items-center gap-1 px-2.5 pb-2.5 pt-1 text-[11px] font-semibold transition-colors sm:px-3.5 sm:text-sm ${
              active ? "text-ink" : "text-ink/45 hover:text-ink/75"
            }`}
          >
            <CategoryIcon
              categoryKey={tab.key}
              className={`h-5 w-5 transition-opacity sm:h-6 sm:w-6 ${
                active ? "opacity-100" : "opacity-70 group-hover:opacity-100"
              }`}
            />
            <span className="whitespace-nowrap">{tab.label}</span>
            <span
              className={`absolute inset-x-1.5 bottom-0 h-[2.5px] rounded-full transition-colors sm:inset-x-2 ${
                active ? "bg-ink" : "bg-transparent group-hover:bg-ink/20"
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
}

function UserActions({
  isLoggedIn,
  isAdmin,
  displayInitial,
  profileTitle,
  urgentBookmarkCount,
  compact,
}: {
  isLoggedIn: boolean;
  isAdmin: boolean;
  displayInitial: string;
  profileTitle: string;
  urgentBookmarkCount: number;
  compact?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      {isLoggedIn ? (
        <>
          {isAdmin && (
            <Link
              href="/admin"
              className="hidden rounded-full border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/20 sm:inline-flex"
            >
              관리자
            </Link>
          )}
          <Link
            href="/mypage"
            className={`relative inline-flex items-center justify-center rounded-full bg-beige text-ink/70 transition-colors hover:bg-cream hover:text-brand ${
              compact ? "h-8 w-8" : "h-9 w-9 sm:h-10 sm:w-10"
            }`}
            aria-label="마이페이지"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a3 3 0 0 1-5.714 0m5.714 0H9.143"
              />
            </svg>
            {urgentBookmarkCount > 0 && (
              <span className="absolute right-0 top-0 flex h-4 min-w-4 translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                {urgentBookmarkCount > 99 ? "99+" : urgentBookmarkCount}
              </span>
            )}
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="hidden rounded-full px-3 py-1.5 text-sm font-medium text-ink/60 transition-colors hover:bg-cream hover:text-ink sm:inline-flex"
            >
              로그아웃
            </button>
          </form>
          <Link
            href="/mypage"
            className={`flex items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition hover:shadow-md ${
              compact ? "gap-1.5 py-1 pl-2.5 pr-1" : "gap-2 py-1.5 pl-3 pr-1.5"
            }`}
            aria-label="프로필"
            title={profileTitle}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="h-4 w-4 text-ink"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M3 6.75A.75.75 0 013.75 6h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 6.75zM3 12a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 12zm0 5.25a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75z"
                clipRule="evenodd"
              />
            </svg>
            <span
              className={`flex items-center justify-center rounded-full bg-brand font-bold text-white ${
                compact ? "h-7 w-7 text-xs" : "h-8 w-8 text-sm"
              }`}
            >
              {displayInitial}
            </span>
          </Link>
        </>
      ) : (
        <>
          <Link
            href="/auth"
            className="hidden text-sm font-medium text-ink/60 transition-colors hover:text-ink sm:inline-flex"
          >
            가입하기
          </Link>
          <Link
            href="/auth"
            className="inline-flex h-8 items-center rounded-full bg-brand px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand/85 sm:h-9 sm:px-5 sm:text-sm"
          >
            로그인하기
          </Link>
        </>
      )}
    </div>
  );
}

export default function AirbnbHeader({
  logoSrc,
  isLoggedIn,
  isAdmin,
  displayInitial,
  profileTitle,
  urgentBookmarkCount,
}: AirbnbHeaderProps) {
  const { query, setQuery } = useHomeSearch();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200/80 bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/90">
      {/* 상단: 로고 | 카테고리(확장) / 컴팩트검색(축소) | 유저 */}
      <div
        className={`relative mx-auto flex max-w-[1760px] items-center justify-between gap-2 px-3 transition-[height] duration-300 ease-out sm:gap-3 sm:px-6 lg:px-10 ${
          scrolled ? "h-16" : "h-[72px] sm:h-[80px]"
        }`}
      >
        <BrandLogo
          logoSrc={logoSrc || undefined}
          priority
          className={`transition-all duration-300 ${
            scrolled
              ? "h-9 max-h-9 max-w-[110px] sm:h-10 sm:max-h-10 sm:max-w-[140px]"
              : "h-10 max-h-10 max-w-[130px] sm:h-12 sm:max-h-12 sm:max-w-[170px] md:h-14 md:max-h-14 md:max-w-[190px]"
          }`}
        />

        {/* 중앙: 확장=카테고리, 축소=컴팩트 검색 */}
        <div className="absolute left-1/2 top-1/2 hidden w-[min(100%,36rem)] -translate-x-1/2 -translate-y-1/2 md:block">
          <div
            className={`transition-all duration-300 ${
              scrolled
                ? "pointer-events-none absolute inset-0 scale-95 opacity-0"
                : "pointer-events-auto relative scale-100 opacity-100"
            }`}
          >
            <CategoryTabs />
          </div>
          <div
            className={`transition-all duration-300 ${
              scrolled
                ? "pointer-events-auto relative scale-100 opacity-100"
                : "pointer-events-none absolute inset-0 scale-95 opacity-0"
            }`}
          >
            <CompactSearch />
          </div>
        </div>

        {/* 모바일 중앙: 축소 시 검색 */}
        <div
          className={`min-w-0 flex-1 md:hidden ${
            scrolled ? "" : "pointer-events-none max-w-0 overflow-hidden opacity-0"
          }`}
        >
          <CompactSearch />
        </div>

        <UserActions
          isLoggedIn={isLoggedIn}
          isAdmin={isAdmin}
          displayInitial={displayInitial}
          profileTitle={profileTitle}
          urgentBookmarkCount={urgentBookmarkCount}
          compact={scrolled}
        />
      </div>

      {/* 모바일 확장: 카테고리 (md 미만, 검색바 위) */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-out md:hidden ${
          scrolled
            ? "pointer-events-none max-h-0 opacity-0"
            : "max-h-20 opacity-100"
        }`}
      >
        <div className="px-2 pb-1">
          <CategoryTabs />
        </div>
      </div>

      {/* 확장 모드: 큰 검색바 (카테고리 아래) */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          scrolled
            ? "pointer-events-none max-h-0 opacity-0"
            : "max-h-28 opacity-100"
        }`}
      >
        <div className="mx-auto flex max-w-[1760px] justify-center px-4 pb-5 pt-1 sm:px-6 lg:px-10">
          <div className="flex w-full max-w-2xl items-center rounded-full border border-gray-200 bg-white shadow-[0_3px_12px_rgba(0,0,0,0.08)] transition hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] focus-within:shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
            <div className="min-w-0 flex-1 px-5 py-3.5 sm:px-6 sm:py-4">
              <span className="block text-xs font-bold text-ink">검색</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="어떤 공고를 찾고 계신가요?"
                className="w-full bg-transparent text-sm text-ink placeholder:text-ink/40 outline-none"
                autoComplete="off"
                aria-label="공고 검색"
              />
            </div>
            <span className="m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm sm:h-12 sm:w-12">
              <SearchIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
