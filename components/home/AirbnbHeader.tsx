"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import BrandLogo from "@/components/BrandLogo";
import { logout } from "@/app/auth/actions";
import { useHomeSearchQuery } from "./HomeSearchContext";
import MobileBottomNav from "./MobileBottomNav";

type AirbnbHeaderProps = {
  logoSrc?: string | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
  displayInitial: string;
  profileTitle: string;
  urgentBookmarkCount: number;
  /** 호환용 — 헤더는 로고·메인탭·검색만 표시 */
  variant?: "expandable" | "compact";
};

const subscribeToBrowserMount = () => () => {};

const MAIN_NAV = [
  { href: "/", label: "홈", match: (path: string) => path === "/" },
  {
    href: "/browse",
    label: "탐색",
    match: (path: string) => path.startsWith("/browse"),
  },
] as const;

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

function useNavigateHomeSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const { query } = useHomeSearchQuery();

  return () => {
    if (pathname === "/") return;
    const q = query.trim();
    router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
  };
}

function MainNav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const pathname = usePathname();
  const profileHref = isLoggedIn ? "/mypage" : "/auth?mode=login";
  const profileActive =
    pathname.startsWith("/mypage") || pathname.startsWith("/auth");
  const libraryActive = pathname.startsWith("/library");

  const items = [
    ...MAIN_NAV,
    {
      href: "/library",
      label: "라이브러리",
      match: () => libraryActive,
    },
    {
      href: profileHref,
      label: "프로필",
      match: () => profileActive,
    },
  ];

  return (
    <nav
      aria-label="주요 메뉴"
      className="hidden items-center gap-0.5 md:flex sm:gap-1"
    >
      {items.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors sm:px-3.5 ${
              active
                ? "bg-brand/15 text-brand"
                : "text-ink/50 hover:bg-beige hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function HeaderSearch() {
  const { query, setQuery } = useHomeSearchQuery();
  const navigateHomeSearch = useNavigateHomeSearch();
  const [expanded, setExpanded] = useState(() => query.trim().length > 0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.trim().length > 0) setExpanded(true);
  }, [query]);

  useEffect(() => {
    if (!expanded) return;
    inputRef.current?.focus();

    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        if (!query.trim()) setExpanded(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!query.trim()) {
          setExpanded(false);
          inputRef.current?.blur();
        } else {
          setQuery("");
        }
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded, query, setQuery]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink/70 transition-colors hover:bg-beige hover:text-ink"
        aria-label="검색 열기"
        title="검색"
      >
        <SearchIcon className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div ref={wrapRef} className="min-w-0">
      <form
        className="flex w-[min(72vw,18rem)] items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 shadow-sm transition-[width] duration-200 sm:w-64 md:w-72"
        onSubmit={(e) => {
          e.preventDefault();
          navigateHomeSearch();
        }}
      >
        <SearchIcon className="h-4 w-4 shrink-0 text-ink/40" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="어떤 공고를 찾고 계신가요?"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink/40 outline-none"
          autoComplete="off"
          aria-label="공고 검색"
        />
      </form>
    </div>
  );
}

function UserActions({
  isLoggedIn,
  isAdmin,
  displayInitial,
  profileTitle,
  onComingSoon,
}: {
  isLoggedIn: boolean;
  isAdmin: boolean;
  displayInitial: string;
  profileTitle: string;
  onComingSoon: (label: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function openLibrary() {
    setMenuOpen(false);
    window.location.href = "/library";
  }

  function showComingSoon(label: string) {
    setMenuOpen(false);
    onComingSoon(label);
  }

  return (
    <div className="relative flex shrink-0 items-center gap-1 sm:gap-2">
      {isLoggedIn ? (
        <button
          type="button"
          onClick={() => showComingSoon("톡")}
          className="hidden h-9 w-9 items-center justify-center rounded-full text-ink/70 transition-colors hover:bg-beige hover:text-ink md:inline-flex"
          aria-label="톡"
          title="톡"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.1 48.1 0 005.714-.215c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
            />
          </svg>
        </button>
      ) : null}

      {!isLoggedIn ? (
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/auth?mode=signup"
            className="rounded-full px-2.5 py-1.5 text-sm font-semibold text-ink/70 transition-colors hover:bg-beige hover:text-ink sm:px-3"
          >
            회원가입
          </Link>
          <Link
            href="/auth?mode=login"
            className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand/85 sm:px-3.5"
          >
            로그인
          </Link>
        </div>
      ) : (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-2.5 pr-1 shadow-sm transition hover:shadow-md"
            aria-label="메뉴"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
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
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
              {displayInitial}
            </span>
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-2 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={openLibrary}
                className="flex w-full px-4 py-2.5 text-left text-sm font-semibold text-ink hover:bg-beige"
              >
                내 라이브러리
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => showComingSoon("메시지")}
                className="flex w-full px-4 py-2.5 text-left text-sm text-ink hover:bg-beige"
              >
                메시지
              </button>
              <Link
                href="/mypage"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex w-full px-4 py-2.5 text-left text-sm text-ink hover:bg-beige"
              >
                프로필
              </Link>
              {isAdmin ? (
                <Link
                  href="/admin"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full px-4 py-2.5 text-left text-sm text-brand hover:bg-beige"
                >
                  관리자
                </Link>
              ) : null}
              <div className="my-1 border-t border-gray-100" />
              <form action={logout}>
                <button
                  type="submit"
                  role="menuitem"
                  className="flex w-full px-4 py-2.5 text-left text-sm text-ink hover:bg-beige"
                >
                  로그아웃
                </button>
              </form>
            </div>
          ) : null}
        </div>
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
}: AirbnbHeaderProps) {
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const portalReady = useSyncExternalStore(
    subscribeToBrowserMount,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!comingSoon) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setComingSoon(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [comingSoon]);

  const comingSoonModal =
    portalReady && comingSoon
      ? createPortal(
          <div
            className="fixed inset-0 z-200 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="coming-soon-title"
            onClick={() => setComingSoon(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="coming-soon-title" className="text-lg font-bold text-ink">
                {comingSoon} 서비스
              </h2>
              <p className="mt-2 text-sm text-ink/60">서비스 준비중입니다.</p>
              <button
                type="button"
                onClick={() => setComingSoon(null)}
                className="mt-5 w-full rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/85"
              >
                확인
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-gray-200/80 bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/90 [overflow-anchor:none]">
        <div className="mx-auto flex h-14 max-w-440 items-center gap-2 pl-1 pr-3 sm:h-15 sm:gap-3 sm:pl-2 sm:pr-6 lg:pl-3 lg:pr-10">
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <BrandLogo
              logoSrc={logoSrc || undefined}
              priority
              className="-ml-0.5 h-4 max-h-4 max-w-16 sm:h-5 sm:max-h-5 sm:max-w-20 md:h-5 md:max-h-5 md:max-w-24"
            />
            <MainNav isLoggedIn={isLoggedIn} />
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2">
            <HeaderSearch />
            <UserActions
              isLoggedIn={isLoggedIn}
              isAdmin={isAdmin}
              displayInitial={displayInitial}
              profileTitle={profileTitle}
              onComingSoon={setComingSoon}
            />
          </div>
        </div>
      </header>

      <MobileBottomNav
        isLoggedIn={isLoggedIn}
        onMessagesClick={() => setComingSoon("메세지")}
      />

      {comingSoonModal}
    </>
  );
}
