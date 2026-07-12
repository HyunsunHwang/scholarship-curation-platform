"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** ShelfCard 폭·간격과 동일한 브레이크포인트 (Tailwind sm/md/lg) */
function getShelfMetrics(viewportWidth: number) {
  if (viewportWidth >= 1024) return { itemWidth: 188, gap: 16 };
  if (viewportWidth >= 768) return { itemWidth: 172, gap: 16 };
  if (viewportWidth >= 640) return { itemWidth: 156, gap: 16 };
  return { itemWidth: 138, gap: 12 };
}

const OVERSCAN = 3;

type VirtualHorizontalShelfProps<T> = {
  items: T[];
  label: string;
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
};

export default function HorizontalShelf<T>({
  items,
  label,
  getKey,
  renderItem,
}: VirtualHorizontalShelfProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [metrics, setMetrics] = useState(() =>
    typeof window === "undefined"
      ? { itemWidth: 138, gap: 12 }
      : getShelfMetrics(window.innerWidth)
  );

  const stride = metrics.itemWidth + metrics.gap;
  const totalWidth =
    items.length === 0
      ? 0
      : items.length * metrics.itemWidth + (items.length - 1) * metrics.gap;

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < maxScroll - 4);
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setScrollLeft(el.scrollLeft);
    updateArrows();
  }, [updateArrows]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const sync = () => {
      setViewportWidth(el.clientWidth);
      setMetrics(getShelfMetrics(window.innerWidth));
      setScrollLeft(el.scrollLeft);
      updateArrows();
    };

    sync();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [onScroll, updateArrows, items.length]);

  const { startIndex, endIndex, offsetLeft } = useMemo(() => {
    if (items.length === 0 || stride <= 0) {
      return { startIndex: 0, endIndex: -1, offsetLeft: 0 };
    }
    const view = viewportWidth || metrics.itemWidth * 4;
    const rawStart = Math.floor(scrollLeft / stride);
    const rawEnd = Math.ceil((scrollLeft + view) / stride);
    const start = Math.max(0, rawStart - OVERSCAN);
    const end = Math.min(items.length - 1, rawEnd + OVERSCAN);
    return {
      startIndex: start,
      endIndex: end,
      offsetLeft: start * stride,
    };
  }, [items.length, metrics.itemWidth, scrollLeft, stride, viewportWidth]);

  const visibleItems = useMemo(() => {
    if (endIndex < startIndex) return [];
    return items.slice(startIndex, endIndex + 1).map((item, i) => ({
      item,
      index: startIndex + i,
    }));
  }, [endIndex, items, startIndex]);

  function scrollByDir(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.75, 240);
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
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
        className="-mx-1 overflow-x-auto scroll-smooth px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div style={{ width: Math.max(totalWidth, 0) }}>
          <div
            className="flex"
            style={{
              gap: metrics.gap,
              transform: `translate3d(${offsetLeft}px, 0, 0)`,
              willChange: "transform",
            }}
          >
            {visibleItems.map(({ item, index }) => (
              <div
                key={getKey(item, index)}
                role="listitem"
                className="shrink-0"
                style={{ width: metrics.itemWidth }}
              >
                {renderItem(item, index)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
