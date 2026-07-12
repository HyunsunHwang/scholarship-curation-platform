"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** ShelfCard 폭·간격 — Tailwind sm/md/lg와 맞춤 */
function getShelfMetrics(viewportWidth: number) {
  if (viewportWidth >= 1024) return { itemWidth: 188, gap: 16 };
  if (viewportWidth >= 768) return { itemWidth: 172, gap: 16 };
  if (viewportWidth >= 640) return { itemWidth: 156, gap: 16 };
  return { itemWidth: 138, gap: 12 };
}

type HorizontalShelfProps<T> = {
  items: T[];
  label: string;
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
};

/**
 * 가로 선반.
 * 가상화 없이 전체 카드를 렌더링해 스크롤 중 포스터 크기 흔들림을 막고,
 * scroll-snap + stride 단위 이동으로 카드가 중간에 잘리지 않게 한다.
 */
export default function HorizontalShelf<T>({
  items,
  label,
  getKey,
  renderItem,
}: HorizontalShelfProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [metrics, setMetrics] = useState(() =>
    typeof window === "undefined"
      ? { itemWidth: 188, gap: 16 }
      : getShelfMetrics(window.innerWidth)
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
      setMetrics(getShelfMetrics(window.innerWidth));
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

    // 화면에 보이는 카드 수만큼 이동하되, 항상 카드 시작점에 스냅
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
        aria-label={`${label} 이전`}
        onClick={() => scrollByDir(-1)}
        disabled={!canPrev}
        className={`absolute left-0 top-[38%] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-md ring-1 ring-black/5 transition-opacity lg:flex ${
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
        aria-label={`${label} 다음`}
        onClick={() => scrollByDir(1)}
        disabled={!canNext}
        className={`absolute right-0 top-[38%] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-md ring-1 ring-black/5 transition-opacity lg:flex ${
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
        aria-label={label}
        className="snap-x snap-mandatory overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div
          className="flex"
          style={{
            gap: metrics.gap,
            // 첫/끝 카드가 컨테이너에 잘리지 않도록 좌우 여백
            paddingLeft: 2,
            paddingRight: 2,
          }}
        >
          {items.map((item, index) => (
            <div
              key={getKey(item, index)}
              role="listitem"
              className="shrink-0 snap-start"
              style={{ width: metrics.itemWidth }}
            >
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
