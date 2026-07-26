"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import BrandLogo from "@/components/BrandLogo";
import ProfileAvatar from "@/components/ProfileAvatar";
import { logout } from "@/app/auth/actions";

type CorporateHeaderProps = {
  logoSrc?: string | null;
  profileTitle: string;
  profileAvatarUrl?: string | null;
};

const subscribeToBrowserMount = () => () => {};

const TALENT_SUBNAV = [
  { href: "/corporate/talent", label: "탐색" },
  { href: "/corporate/talent/saved", label: "저장한 인재" },
  { href: "/corporate/talent/viewers", label: "우리 공고 조회한 인재" },
  { href: "/corporate/talent/recent", label: "최근 본 인재" },
] as const;

const MAIN_NAV = [
  {
    href: "/corporate",
    label: "홈",
    match: (path: string) => path === "/corporate",
  },
  {
    href: "/corporate/talent",
    label: "인재 찾기",
    match: (path: string) => path.startsWith("/corporate/talent"),
    children: TALENT_SUBNAV,
  },
  {
    href: "/corporate/offers",
    label: "제안 관리",
    match: (path: string) => path.startsWith("/corporate/offers"),
  },
  {
    href: "/corporate/jobs",
    label: "채용공고",
    match: (path: string) => path.startsWith("/corporate/jobs"),
  },
  {
    href: "/corporate/company",
    label: "기업 페이지",
    match: (path: string) => path.startsWith("/corporate/company"),
  },
] as const;

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function TalkIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
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
  );
}

function MainNav() {
  const pathname = usePathname();
  const [talentOpen, setTalentOpen] = useState(false);
  const talentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!talentOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!talentRef.current?.contains(e.target as Node)) setTalentOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTalentOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [talentOpen]);

  return (
    <nav
      aria-label="기업 주요 메뉴"
      className="hidden items-center gap-0.5 lg:flex"
    >
      {MAIN_NAV.map((item) => {
        const active = item.match(pathname);
        const hasChildren = "children" in item && item.children;

        if (hasChildren) {
          return (
            <div key={item.label} ref={talentRef} className="relative">
              <button
                type="button"
                onClick={() => setTalentOpen((v) => !v)}
                aria-expanded={talentOpen}
                aria-haspopup="menu"
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors sm:px-3.5 ${
                  active
                    ? "bg-brand/15 text-brand"
                    : "text-ink/50 hover:bg-beige hover:text-ink"
                }`}
              >
                {item.label}
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    talentOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {talentOpen ? (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-2 shadow-lg"
                >
                  {item.children.map((child) => {
                    const childActive = pathname === child.href;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        role="menuitem"
                        onClick={() => setTalentOpen(false)}
                        className={`flex w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-beige ${
                          childActive
                            ? "font-semibold text-brand"
                            : "text-ink"
                        }`}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        }

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

function UserActions({
  profileTitle,
  profileAvatarUrl,
  onComingSoon,
}: {
  profileTitle: string;
  profileAvatarUrl?: string | null;
  onComingSoon: (label: string) => void;
}) {
  const pathname = usePathname();
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

  return (
    <div className="relative flex shrink-0 items-center gap-1 sm:gap-2">
      <button
        type="button"
        onClick={() => onComingSoon("톡")}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink/70 transition-colors hover:bg-beige hover:text-ink"
        aria-label="톡"
        title="톡"
      >
        <TalkIcon className="h-5 w-5" />
      </button>

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
          <ProfileAvatar
            src={profileAvatarUrl}
            alt={profileTitle}
            className="h-7 w-7"
            sizes="28px"
          />
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white py-2 shadow-lg"
          >
            <div className="lg:hidden">
              <p className="px-4 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink/40">
                메뉴
              </p>
              {MAIN_NAV.map((item) => {
                const active = item.match(pathname);
                const hasChildren = "children" in item && item.children;
                return (
                  <div key={item.label}>
                    <Link
                      href={item.href}
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className={`flex w-full px-4 py-2.5 text-left text-sm hover:bg-beige ${
                        active ? "font-semibold text-brand" : "text-ink"
                      }`}
                    >
                      {item.label}
                    </Link>
                    {hasChildren
                      ? item.children.map((child) => {
                          const childActive = pathname === child.href;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              role="menuitem"
                              onClick={() => setMenuOpen(false)}
                              className={`flex w-full px-4 py-2 pl-8 text-left text-sm hover:bg-beige ${
                                childActive
                                  ? "font-semibold text-brand"
                                  : "text-ink/70"
                              }`}
                            >
                              {child.label}
                            </Link>
                          );
                        })
                      : null}
                  </div>
                );
              })}
              <div className="my-1 border-t border-gray-100" />
            </div>

            <Link
              href="/corporate/company"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="hidden w-full px-4 py-2.5 text-left text-sm text-ink hover:bg-beige lg:flex"
            >
              기업 페이지
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onComingSoon("메시지");
              }}
              className="flex w-full px-4 py-2.5 text-left text-sm text-ink hover:bg-beige"
            >
              메시지
            </button>
            <Link
              href="/admin"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex w-full px-4 py-2.5 text-left text-sm text-brand hover:bg-beige"
            >
              관리자 패널
            </Link>
            <Link
              href="/"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex w-full px-4 py-2.5 text-left text-sm text-ink hover:bg-beige"
            >
              학생 사이트로
            </Link>
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
    </div>
  );
}

export default function CorporateHeader({
  logoSrc,
  profileTitle,
  profileAvatarUrl,
}: CorporateHeaderProps) {
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
            aria-labelledby="corporate-coming-soon-title"
            onClick={() => setComingSoon(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="corporate-coming-soon-title"
                className="text-lg font-bold text-ink"
              >
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
          document.body,
        )
      : null;

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-gray-200/80 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur supports-backdrop-filter:bg-white/90">
        <div className="mx-auto flex h-14 max-w-440 items-center gap-2 px-4 sm:h-15 sm:gap-3 sm:px-6 lg:px-10">
          <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-3">
            <BrandLogo
              logoSrc={logoSrc || undefined}
              href="/corporate"
              priority
              className="h-3.5 max-h-3.5 max-w-14 sm:h-4 sm:max-h-4 sm:max-w-16 md:h-4 md:max-h-4 md:max-w-18"
            />
            <span className="hidden rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand sm:inline">
              기업
            </span>
            <MainNav />
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2">
            <UserActions
              profileTitle={profileTitle}
              profileAvatarUrl={profileAvatarUrl}
              onComingSoon={setComingSoon}
            />
          </div>
        </div>
      </header>
      {comingSoonModal}
    </>
  );
}
