"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export default function HorizontalShelf({
  children,
  label,
}: {
  children: ReactNode;
  /** 접근성용 선반 이름 */
  label: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener("scroll", updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      ro.disconnect();
    };
  }, [updateArrows, children]);

  function scrollByDir(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.75, 240);
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  }

  return (
    <div className="group/shelf relative">
      {/* 이전 */}
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

      {/* 다음 */}
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
        className="-mx-1 flex gap-3 overflow-x-auto scroll-smooth px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-4"
      >
        {children}
      </div>
    </div>
  );
}
