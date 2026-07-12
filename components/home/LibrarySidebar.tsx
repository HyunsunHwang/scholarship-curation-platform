"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CardScholarship } from "@/components/ScholarshipCard";
import {
  contentKindHref,
  contentKindLabel,
} from "@/lib/content-categories";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import {
  daysUntilApplyDeadlineKorea,
  isAlwaysOpenRecruitment,
} from "@/lib/scholarship-dates";
import {
  readRecentViews,
  RECENT_VIEWS_CHANGED_EVENT,
  type RecentViewItem,
} from "@/lib/recent-views";

type LibrarySidebarProps = {
  isLoggedIn: boolean;
  bookmarkedScholarships?: CardScholarship[];
  /** 세로 사이드바(데스크톱) vs 가로 카드 스택(모바일) */
  variant?: "sidebar" | "rail";
  /** 데스크톱에서 왼쪽 패널 접기 */
  onCollapse?: () => void;
};

type LibraryTab = "recent" | "saved";

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
    <div className="rounded-xl bg-beige p-3.5">
      <p className="text-sm font-bold text-ink">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink/55">{description}</p>
      <Link
        href={href}
        className={`mt-2.5 inline-flex rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
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

function LibraryItemRow({
  href,
  name,
  posterUrl,
  kindLabel,
  meta,
}: {
  href: string;
  name: string;
  posterUrl: string | null;
  kindLabel: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-beige"
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-cream">
        {posterUrl ? (
          <Image
            src={posterUrl}
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
          {kindLabel} · {meta}
        </p>
      </div>
    </Link>
  );
}

/**
 * 스포티파이 '내 라이브러리' 스타일.
 * - 최근 본 공고: 비로그인 포함 (localStorage)
 * - 로그인: 맞춤/교내 핀 + 담은 공고
 */
export default function LibrarySidebar({
  isLoggedIn,
  bookmarkedScholarships = [],
  variant = "sidebar",
  onCollapse,
}: LibrarySidebarProps) {
  const [libraryQuery, setLibraryQuery] = useState("");
  const [tab, setTab] = useState<LibraryTab>("recent");
  const [recentViews, setRecentViews] = useState<RecentViewItem[]>([]);

  useEffect(() => {
    const sync = () => setRecentViews(readRecentViews());
    sync();
    window.addEventListener(RECENT_VIEWS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(RECENT_VIEWS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const filteredRecent = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    if (!q) return recentViews;
    return recentViews.filter((s) => {
      const name = cleanScholarshipName(s.name).toLowerCase();
      return (
        name.includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.organization.toLowerCase().includes(q)
      );
    });
  }, [recentViews, libraryQuery]);

  const filteredSaved = useMemo(() => {
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

  const activeTab: LibraryTab = isLoggedIn ? tab : "recent";
  const listItems =
    activeTab === "saved"
      ? filteredSaved.map((item) => ({
          key: `saved-${item.id}`,
          href: contentKindHref(item.content_kind, item.id),
          name: cleanScholarshipName(item.name),
          posterUrl: item.poster_image_url ?? null,
          kindLabel: contentKindLabel(item.content_kind),
          meta: deadlineShort(item.apply_end_date),
        }))
      : filteredRecent.map((item) => ({
          key: `recent-${item.content_kind}-${item.id}`,
          href: contentKindHref(item.content_kind, item.id),
          name: cleanScholarshipName(item.name),
          posterUrl: item.poster_image_url,
          kindLabel: contentKindLabel(item.content_kind),
          meta: deadlineShort(item.apply_end_date),
        }));

  const emptyMessage =
    activeTab === "saved"
      ? bookmarkedScholarships.length === 0
        ? "아직 담은 공고가 없어요"
        : "검색 결과가 없어요"
      : recentViews.length === 0
        ? "최근 본 공고가 없어요"
        : "검색 결과가 없어요";

  const listBody = (
    <>
      {isLoggedIn ? (
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
      ) : (
        <div className="shrink-0 space-y-2 px-2.5 pb-2">
          <ServiceCard
            title="조건에 맞는 장학금"
            description="프로필로 자격 맞는 장학금만 골라드려요."
            ctaLabel="로그인하고 시작하기"
            href="/auth"
            primary
          />
          <ServiceCard
            title="교내 기회"
            description="로그인하면 우리 학교 전용 장학금을 볼 수 있어요."
            ctaLabel="로그인하고 보기"
            href="/auth"
          />
        </div>
      )}

      {isLoggedIn ? (
        <div className="flex gap-1.5 overflow-x-auto px-2.5 pb-2 [scrollbar-width:none]">
          {(
            [
              { key: "recent", label: "최근 본" },
              { key: "saved", label: "담은 공고" },
            ] as const
          ).map((chip) => {
            const active = tab === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setTab(chip.key)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-brand text-white"
                    : "bg-beige text-ink/70 hover:bg-cream"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink/40">
          최근 본 공고
        </p>
      )}

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
            placeholder={activeTab === "saved" ? "담은 공고 검색" : "최근 본 공고 검색"}
            className="w-full rounded-lg bg-beige py-1.5 pl-8 pr-2 text-xs text-ink placeholder:text-ink/40 outline-none focus:ring-1 focus:ring-brand/30"
            aria-label={activeTab === "saved" ? "담은 공고 검색" : "최근 본 공고 검색"}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {listItems.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="text-xs font-medium text-ink/60">{emptyMessage}</p>
            {activeTab === "recent" && recentViews.length === 0 && (
              <p className="mt-1 text-[11px] text-ink/40">
                공고를 열어보면 여기에 쌓여요
              </p>
            )}
            {isLoggedIn &&
              activeTab === "saved" &&
              bookmarkedScholarships.length === 0 && (
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
            {listItems.map((item) => (
              <li key={item.key}>
                <LibraryItemRow
                  href={item.href}
                  name={item.name}
                  posterUrl={item.posterUrl}
                  kindLabel={item.kindLabel}
                  meta={item.meta}
                />
              </li>
            ))}
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
          {isLoggedIn ? (
            <Link href="/mypage" className="text-xs font-semibold text-brand hover:underline">
              전체
            </Link>
          ) : (
            <Link href="/auth" className="text-xs font-semibold text-brand hover:underline">
              로그인
            </Link>
          )}
        </div>
        <div className="flex max-h-[360px] flex-col pt-1">{listBody}</div>
      </section>
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col rounded-2xl border border-gray-200/80 bg-white">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-3">
        <h2 className="text-sm font-bold text-ink">내 라이브러리</h2>
        <div className="flex items-center gap-0.5">
          {onCollapse ? (
            <button
              type="button"
              onClick={onCollapse}
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink/50 transition-colors hover:bg-beige hover:text-ink"
              aria-label="라이브러리 접기"
              title="라이브러리 접기"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5"
                />
              </svg>
            </button>
          ) : null}
          <Link
            href={isLoggedIn ? "/mypage" : "/auth"}
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink/50 transition-colors hover:bg-beige hover:text-ink"
            aria-label={isLoggedIn ? "마이페이지" : "로그인"}
            title={isLoggedIn ? "마이페이지" : "로그인"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </Link>
        </div>
      </div>
      {listBody}
    </aside>
  );
}
