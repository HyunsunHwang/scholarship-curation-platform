"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CardScholarship } from "@/components/ScholarshipCard";

function getMetrics(viewportWidth: number) {
  if (viewportWidth >= 1024) return { itemWidth: 220, gap: 12, numberSize: 96 };
  if (viewportWidth >= 768) return { itemWidth: 200, gap: 10, numberSize: 88 };
  if (viewportWidth >= 640) return { itemWidth: 180, gap: 10, numberSize: 80 };
  return { itemWidth: 164, gap: 8, numberSize: 72 };
}

export default function Top10Shelf({
  items,
  renderCard,
}: {
  items: CardScholarship[];
  renderCard: (scholarship: CardScholarship, rank: number) => ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [metrics, setMetrics] = useState(() =>
    typeof window === "undefined"
      ? { itemWidth: 220, gap: 12, numberSize: 96 }
      : getMetrics(window.innerWidth)
  );

  const stride = metrics.itemWidth + metrics.gap;

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 2);
    setCanNext(el.scrollLeft < maxScroll - 2);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const sync = () => {
      setMetrics(getMetrics(window.innerWidth));
      updateArrows();
    };

    sync();
    el.addEventListener("scroll", updateArrows, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);

    return () => {
      el.removeEventListener("scroll", updateArrows);
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [updateArrows, items.length]);

  function scrollByDir(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el || stride <= 0) return;
    const page = Math.max(1, Math.floor((el.clientWidth + metrics.gap) / stride));
    const currentIndex = Math.round(el.scrollLeft / stride);
    const nextIndex = Math.max(
      0,
      Math.min(items.length - 1, currentIndex + dir * page)
    );
    el.scrollTo({ left: nextIndex * stride, behavior: "smooth" });
  }

  return (
    <div className="group/shelf relative">
      <button
        type="button"
        aria-label="TOP 10 이전"
        onClick={() => scrollByDir(-1)}
        disabled={!canPrev}
        className={`absolute left-0 top-[42%] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-md ring-1 ring-black/5 transition-opacity lg:flex ${
          canPrev
            ? "opacity-0 group-hover/shelf:opacity-100 hover:scale-105"
            : "pointer-events-none opacity-0"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5 8.25 12l7.5-7.5"
          />
        </svg>
      </button>

      <button
        type="button"
        aria-label="TOP 10 다음"
        onClick={() => scrollByDir(1)}
        disabled={!canNext}
        className={`absolute right-0 top-[42%] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-md ring-1 ring-black/5 transition-opacity lg:flex ${
          canNext
            ? "opacity-0 group-hover/shelf:opacity-100 hover:scale-105"
            : "pointer-events-none opacity-0"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m8.25 4.5 7.5 7.5-7.5 7.5"
          />
        </svg>
      </button>

      <div
        ref={scrollerRef}
        role="list"
        aria-label="오늘 TOP 10"
        className="snap-x snap-mandatory overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div
          className="flex"
          style={{ gap: metrics.gap, paddingLeft: 2, paddingRight: 2 }}
        >
          {items.map((item, index) => {
            const rank = index + 1;
            const cardWidth = Math.round(metrics.itemWidth * 0.62);
            return (
              <div
                key={`${item.content_kind ?? "scholarship"}-${item.id}`}
                role="listitem"
                className="relative shrink-0 snap-start"
                style={{ width: metrics.itemWidth }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute bottom-10 left-0 z-0 select-none font-black leading-none text-ink/[0.12]"
                  style={{
                    fontSize: metrics.numberSize,
                    letterSpacing: rank === 10 ? -6 : -2,
                  }}
                >
                  {rank}
                </span>
                <div
                  className="relative z-10 ml-auto"
                  style={{ width: cardWidth }}
                >
                  {renderCard(item, rank)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
