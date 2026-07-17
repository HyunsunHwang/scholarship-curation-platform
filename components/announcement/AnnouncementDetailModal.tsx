"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import AnnouncementDetailBody from "@/components/announcement/AnnouncementDetailBody";
import type { AnnouncementDetailPayload } from "@/lib/announcement-detail";

export default function AnnouncementDetailModal({
  open,
  loading,
  error,
  data,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  data: AnnouncementDetailPayload | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, data]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] hidden items-end justify-center bg-black/60 p-0 md:flex md:items-start md:overflow-y-auto md:px-4 md:py-8 lg:px-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative my-0 w-full max-w-4xl overflow-hidden rounded-none bg-white shadow-2xl outline-none md:my-auto md:rounded-2xl"
      >
        <span id={titleId} className="sr-only">
          {data?.name ?? "공고 상세"}
        </span>

        {loading ? (
          <div className="animate-pulse space-y-3 px-6 py-6">
            <div className="h-6 w-2/3 rounded bg-gray-200" />
            <div className="h-4 w-1/3 rounded bg-gray-100" />
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="h-32 rounded-xl bg-gray-100" />
              <div className="h-32 rounded-xl bg-gray-100" />
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="text-base font-semibold text-ink">공고를 불러오지 못했습니다</p>
            <p className="text-sm text-ink/50">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white"
            >
              닫기
            </button>
          </div>
        ) : data ? (
          <div className="max-h-[min(92vh,920px)] overflow-y-auto overscroll-contain">
            <AnnouncementDetailBody data={data} onClose={onClose} />
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
