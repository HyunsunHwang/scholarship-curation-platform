"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { CardScholarship } from "@/components/ScholarshipCard";
import { contentKindHref } from "@/lib/content-categories";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import {
  daysUntilApplyDeadlineKorea,
  isAlwaysOpenRecruitment,
} from "@/lib/scholarship-dates";

type LibrarySidebarProps = {
  isLoggedIn: boolean;
  bookmarkedScholarships?: CardScholarship[];
  /** 세로 사이드바(데스크톱) vs 가로 카드 스택(모바일) */
  variant?: "sidebar" | "rail";
};

function deadlineShort(dateStr: string): string {
  if (isAlwaysOpenRecruitment(dateStr)) return "상시모집";
  const days = daysUntilApplyDeadlineKorea(dateStr);
  if (days < 0) return "마감됨";
  if (days === 0) return "오늘 마감";
  if (days <= 7) return `D-${days}`;
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m)}.${parseInt(d)} 마감`;
}

function ServiceCard({
  title,
  description,
  ctaLabel,
  href,
  primary,
}: {
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <div className="rounded-xl bg-beige p-4">
      <p className="text-sm font-bold text-ink">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink/55">{description}</p>
      <Link
        href={href}
        className={`mt-3 inline-flex rounded-full px-4 py-2 text-xs font-bold transition-colors ${
          primary
            ? "bg-brand text-white hover:bg-brand/85"
            : "bg-white text-ink shadow-sm hover:bg-cream"
        }`}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

function PinnedRow({
  href,
  title,
  subtitle,
  tone,
}: {
  href: string;
  title: string;
  subtitle: string;
  tone: "brand" | "campus";
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-beige"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white ${
          tone === "brand"
            ? "bg-linear-to-br from-brand to-[#c00000]"
            : "bg-linear-to-br from-sky-400 to-sky-700"
        }`}
        aria-hidden
      >
        {tone === "brand" ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.26 10.147a60.44 60.44 0 00-.491 6.347A48.63 48.63 0 0112 15.75c2.73 0 5.405.273 8.004.791a60.48 60.48 0 00-.491-6.347m-15.052 0a60.66 60.66 0 01-.514-3.63 48.73 48.73 0 0116.112 0c-.18 1.223-.34 2.434-.514 3.63m-15.052 0A50.02 50.02 0 0112 9.75c2.292 0 4.534.198 6.74.574"
            />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
            />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{title}</span>
        <span className="block truncate text-xs text-ink/50">{subtitle}</span>
      </span>
    </Link>
  );
}

/**
 * 스포티파이 '내 라이브러리' 스타일.
 * - 비로그인: 맞춤·교내 어필 카드
 * - 로그인: 핀(맞춤/교내) + 담은 공고 콤팩트 리스트
 */
export default function LibrarySidebar({
  isLoggedIn,
  bookmarkedScholarships = [],
  variant = "sidebar",
}: LibrarySidebarProps) {
  const [libraryQuery, setLibraryQuery] = useState("");

  const visibleItems = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    if (!q) return bookmarkedScholarships;
    return bookmarkedScholarships.filter((s) => {
      const name = cleanScholarshipName(s.name).toLowerCase();
      return (
        name.includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.organization.toLowerCase().includes(q)
      );
    });
  }, [bookmarkedScholarships, libraryQuery]);

  // ── 비로그인 / 모바일 rail: 어필 카드 ──────────────────────────
  if (!isLoggedIn) {
    if (variant === "rail") {
      return (
        <section aria-label="내 라이브러리" className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0 flex-1">
            <ServiceCard
              title="조건에 맞는 장학금"
              description="프로필 조건으로 자격 맞는 장학금만 골라드려요."
              ctaLabel="로그인하고 시작하기"
              href="/auth"
              primary
            />
          </div>
          <div className="min-w-0 flex-1">
            <ServiceCard
              title="교내 기회"
              description="우리 학교 학생만 볼 수 있는 교내 장학금을 확인하세요."
              ctaLabel="로그인하고 보기"
              href="/auth"
            />
          </div>
        </section>
      );
    }

    return (
      <aside className="flex h-full min-h-0 w-full flex-col rounded-2xl border border-gray-200/80 bg-white">
        <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-3">
          <h2 className="text-sm font-bold text-ink">내 라이브러리</h2>
          <Link
            href="/auth"
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink/50 transition-colors hover:bg-beige hover:text-ink"
            aria-label="로그인"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </Link>
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 pb-4 pt-2">
          <ServiceCard
            title="조건에 맞는 장학금"
            description="학력·성적·소득 등 내 조건에 맞는 장학금만 추천해 드려요."
            ctaLabel="로그인하고 시작하기"
            href="/auth"
            primary
          />
          <ServiceCard
            title="교내 기회"
            description="로그인하면 우리 학교 전용 교내 장학금을 볼 수 있어요."
            ctaLabel="로그인하고 보기"
            href="/auth"
          />
        </div>
      </aside>
    );
  }

  // ── 로그인: 콤팩트 리스트 ──────────────────────────────────────
  const listBody = (
    <>
      <div className="shrink-0 space-y-0.5 px-1.5 pb-1">
        <PinnedRow
          href="/matched"
          title="조건에 맞는 장학금"
          subtitle="맞춤 추천"
          tone="brand"
        />
        <PinnedRow
          href="/matched?scope=campus"
          title="교내 기회"
          subtitle="우리 학교 전용"
          tone="campus"
        />
      </div>

      <div className="px-2.5 pb-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/35">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </span>
          <input
            type="search"
            value={libraryQuery}
            onChange={(e) => setLibraryQuery(e.target.value)}
            placeholder="담은 공고 검색"
            className="w-full rounded-lg bg-beige py-1.5 pl-8 pr-2 text-xs text-ink placeholder:text-ink/40 outline-none focus:ring-1 focus:ring-brand/30"
            aria-label="담은 공고 검색"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {visibleItems.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="text-xs font-medium text-ink/60">
              {bookmarkedScholarships.length === 0
                ? "아직 담은 공고가 없어요"
                : "검색 결과가 없어요"}
            </p>
            {bookmarkedScholarships.length === 0 && (
              <Link
                href="/mypage"
                className="mt-2 inline-block text-xs font-semibold text-brand hover:underline"
              >
                마이페이지로 이동
              </Link>
            )}
          </div>
        ) : (
          <ul className="flex flex-col">
            {visibleItems.map((item) => {
              const name = cleanScholarshipName(item.name);
              return (
                <li key={item.id}>
                  <Link
                    href={contentKindHref(item.content_kind, item.id)}
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-beige"
                  >
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-cream">
                      {item.poster_image_url ? (
                        <Image
                          src={item.poster_image_url}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-brand/15 text-xs font-bold text-brand">
                          {name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{name}</p>
                      <p className="truncate text-xs text-ink/50">
                        장학금 · {deadlineShort(item.apply_end_date)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );

  if (variant === "rail") {
    return (
      <section
        aria-label="내 라이브러리"
        className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white"
      >
        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          <h2 className="text-sm font-bold text-ink">내 라이브러리</h2>
          <Link href="/mypage" className="text-xs font-semibold text-brand hover:underline">
            전체
          </Link>
        </div>
        <div className="flex max-h-[280px] flex-col pt-1">{listBody}</div>
      </section>
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col rounded-2xl border border-gray-200/80 bg-white">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-3">
        <h2 className="text-sm font-bold text-ink">내 라이브러리</h2>
        <Link
          href="/mypage"
          className="flex h-7 w-7 items-center justify-center rounded-full text-ink/50 transition-colors hover:bg-beige hover:text-ink"
          aria-label="마이페이지"
          title="마이페이지"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </Link>
      </div>
      {listBody}
    </aside>
  );
}
