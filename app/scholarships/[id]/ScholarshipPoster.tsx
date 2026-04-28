"use client";

import { useEffect, useId, useState } from "react";

type Props = {
  posterUrl: string;
  alt: string;
};

export default function ScholarshipPoster({ posterUrl, alt }: Props) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block h-full w-full overflow-hidden rounded-2xl border border-gray-100 shadow-sm outline-none aspect-2/3 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={titleId}
      >
        <img
          src={posterUrl}
          alt={alt}
          className="h-full w-full object-cover transition duration-200 group-hover:brightness-[0.97]"
        />
        <span className="pointer-events-none absolute inset-0 ring-0 transition group-hover:ring-2 group-hover:ring-inset group-hover:ring-white/40" />
        <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-white shadow-sm opacity-0 transition group-hover:opacity-100">
          크게 보기
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 sm:p-10 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex max-h-[min(72vh,640px)] w-full max-w-[min(88vw,40rem)] items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p id={titleId} className="sr-only">
              {alt} — 확대 보기
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -top-10 right-0 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 sm:-top-11 sm:text-sm"
            >
              닫기
            </button>
            <img
              src={posterUrl}
              alt=""
              className="max-h-[min(72vh,640px)] w-full max-w-full rounded-lg object-contain shadow-2xl"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
