"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { CardScholarship } from "@/components/ScholarshipCard";
import {
  LIBRARY_CATEGORY_FILTERS,
  categoryHasData,
  type ContentCategoryKey,
} from "@/lib/content-categories";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { daysUntilApplyDeadlineKorea, isAlwaysOpenRecruitment } from "@/lib/scholarship-dates";

type LibraryFilter = Exclude<ContentCategoryKey, "all">;

function deadlineShort(dateStr: string): string {
  if (isAlwaysOpenRecruitment(dateStr)) return "상시모집";
  const days = daysUntilApplyDeadlineKorea(dateStr);
  if (days < 0) return "마감됨";
  if (days === 0) return "오늘 마감";
  if (days <= 7) return `D-${days}`;
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m)}.${parseInt(d)} 마감`;
}

export default function LibrarySidebar({
  isLoggedIn,
  bookmarkedScholarships,
}: {
  isLoggedIn: boolean;
  bookmarkedScholarships: CardScholarship[];
}) {
  const [filter, setFilter] = useState<LibraryFilter | null>(null);
  const [libraryQuery, setLibraryQuery] = useState("");

  const visibleItems = useMemo(() => {
    if (filter && !categoryHasData(filter)) return [];
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
  }, [bookmarkedScholarships, filter, libraryQuery]);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col rounded-xl bg-white lg:rounded-2xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <h2 className="text-base font-bold text-ink">내 라이브러리</h2>
        <Link
          href={isLoggedIn ? "/mypage" : "/auth"}
          className="flex h-7 w-7 items-center justify-center rounded-full text-ink/50 transition-colors hover:bg-beige hover:text-ink"
          aria-label={isLoggedIn ? "마이페이지" : "로그인"}
          title={isLoggedIn ? "마이페이지" : "로그인하고 담기"}
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
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
        </Link>
      </div>

      {/* 카테고리 필터 칩 */}
      <div className="flex gap-1.5 overflow-x-auto px-3 pb-3 [scrollbar-width:none]">
        {LIBRARY_CATEGORY_FILTERS.map((cat) => {
          const active = filter === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setFilter(active ? null : cat.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "bg-brand text-white"
                  : "bg-beige text-ink/70 hover:bg-cream"
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* 로그인 전 유도 */}
      {!isLoggedIn ? (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 pb-4">
          <div className="rounded-xl bg-beige p-4">
            <p className="text-sm font-bold text-ink">
              첫 번째 공고를 담아보세요
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink/55">
              관심 있는 장학금을 북마크하면 여기에 모아볼 수 있어요.
            </p>
            <Link
              href="/auth"
              className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-xs font-bold text-ink shadow-sm transition-colors hover:bg-cream"
            >
              로그인하고 담기
            </Link>
          </div>
          <div className="rounded-xl bg-beige p-4">
            <p className="text-sm font-bold text-ink">맞춤 추천 받기</p>
            <p className="mt-1 text-xs leading-relaxed text-ink/55">
              프로필을 입력하면 나에게 맞는 공고를 찾아드려요.
            </p>
            <Link
              href="/auth"
              className="mt-3 inline-flex rounded-full bg-brand px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-brand/85"
            >
              시작하기
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* 검색 */}
          <div className="px-3 pb-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/35">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="h-3.5 w-3.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                  />
                </svg>
              </span>
              <input
                type="search"
                value={libraryQuery}
                onChange={(e) => setLibraryQuery(e.target.value)}
                placeholder="라이브러리 검색"
                className="w-full rounded-lg bg-beige py-1.5 pl-8 pr-2 text-xs text-ink placeholder:text-ink/40 outline-none focus:ring-1 focus:ring-brand/30"
                aria-label="라이브러리 검색"
              />
            </div>
          </div>

          {/* 목록 */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            {visibleItems.length === 0 ? (
              <div className="px-2 py-8 text-center">
                <p className="text-sm font-medium text-ink/70">
                  {filter && !categoryHasData(filter)
                    ? `${LIBRARY_CATEGORY_FILTERS.find((c) => c.key === filter)?.label ?? ""} 공고는 준비 중이에요`
                    : bookmarkedScholarships.length === 0
                      ? "아직 담은 공고가 없어요"
                      : "검색 결과가 없어요"}
                </p>
                {bookmarkedScholarships.length === 0 &&
                  (!filter || categoryHasData(filter)) && (
                    <Link
                      href="/#all-announcements"
                      className="mt-2 inline-block text-xs font-semibold text-brand hover:underline"
                    >
                      공고 둘러보기
                    </Link>
                  )}
              </div>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {visibleItems.map((item) => {
                  const name = cleanScholarshipName(item.name);
                  return (
                    <li key={item.id}>
                      <Link
                        href={`/scholarships/${item.id}`}
                        className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-beige"
                      >
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-cream">
                          {item.poster_image_url ? (
                            <Image
                              src={item.poster_image_url}
                              alt=""
                              fill
                              sizes="48px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-brand/15 text-xs font-bold text-brand">
                              {name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink">
                            {name}
                          </p>
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
      )}
    </aside>
  );
}
