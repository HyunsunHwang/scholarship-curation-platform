"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
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

function deadlineShort(dateStr: string): string {
  if (isAlwaysOpenRecruitment(dateStr)) return "상시모집";
  const days = daysUntilApplyDeadlineKorea(dateStr);
  if (days < 0) return "마감됨";
  if (days === 0) return "오늘 마감";
  if (days <= 7) return `D-${days}`;
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m)}.${parseInt(d)} 마감`;
}

export default function LibraryRecentList() {
  const [items, setItems] = useState<RecentViewItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => setItems(readRecentViews());
    sync();
    setHydrated(true);
    window.addEventListener(RECENT_VIEWS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(RECENT_VIEWS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
        <div className="h-8 w-40 animate-pulse rounded bg-gray-200" />
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="aspect-2/3 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
      <Link
        href="/library"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink/55 transition-colors hover:text-ink"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        내 라이브러리
      </Link>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        최근 조회
      </h1>
      <p className="mt-1.5 text-sm text-ink/50">
        {items.length > 0 ? `${items.length}개` : "아직 본 공고가 없어요"}
      </p>

      {items.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="text-lg font-semibold text-ink">최근 본 공고가 없어요</p>
          <p className="mt-1 text-sm text-ink/50">공고를 열어보면 여기에 쌓여요</p>
          <Link
            href="/browse"
            className="mt-5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand/85"
          >
            탐색하러 가기
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <li key={`${item.content_kind}-${item.id}`}>
              <Link
                href={contentKindHref(item.content_kind, item.id)}
                className="group block"
              >
                <div className="relative aspect-2/3 overflow-hidden rounded-xl bg-cream shadow-sm ring-1 ring-black/5">
                  {item.poster_image_url ? (
                    <Image
                      src={item.poster_image_url}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 45vw, 20vw"
                      className="object-cover transition duration-200 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-brand/10 text-2xl font-bold text-brand">
                      {cleanScholarshipName(item.name).charAt(0)}
                    </div>
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-semibold text-ink group-hover:text-brand">
                  {cleanScholarshipName(item.name)}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink/45">
                  {contentKindLabel(item.content_kind)} · {deadlineShort(item.apply_end_date)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
