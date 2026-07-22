"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { toggleBookmark, toggleContestBookmark } from "@/app/mypage/actions";

const BOOKMARK_EVENT = "scholarship:bookmark-toggled";

const posterPlaceholderGradient = "from-brand to-[#8019de]";

type Props = {
  scholarshipId: number;
  posterUrl: string | null;
  alt: string;
  title: string;
  organizationInitial: string;
  initialBookmarked: boolean;
  /** false면 스크랩 버튼 숨김 */
  showBookmark?: boolean;
  /** 공모전·교육·대외활동은 contest_bookmarks 사용 */
  bookmarkTarget?: "scholarship" | "contest";
  /** 외부 CDN 포스터 등 */
  unoptimizedPoster?: boolean;
};

export default function ScholarshipDetailHero({
  scholarshipId,
  posterUrl,
  alt,
  title,
  organizationInitial,
  initialBookmarked,
  showBookmark = true,
  bookmarkTarget = "scholarship",
  unoptimizedPoster = false,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [isPending, startTransition] = useTransition();
  const [shareHint, setShareHint] = useState<string | null>(null);
  const titleId = useId();
  const portalTarget = typeof document === "undefined" ? null : document.body;

  useEffect(() => {
    const onBookmarkToggled = (event: Event) => {
      const detail = (event as CustomEvent<{ scholarshipId: number; bookmarked: boolean }>).detail;
      if (!detail || detail.scholarshipId !== scholarshipId) return;
      setBookmarked(detail.bookmarked);
    };
    window.addEventListener(BOOKMARK_EVENT, onBookmarkToggled as EventListener);
    return () => window.removeEventListener(BOOKMARK_EVENT, onBookmarkToggled as EventListener);
  }, [scholarshipId]);

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

  useEffect(() => {
    if (!shareHint) return;
    const t = window.setTimeout(() => setShareHint(null), 2000);
    return () => window.clearTimeout(t);
  }, [shareHint]);

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  function handleBookmark() {
    const next = !bookmarked;
    setBookmarked(next);
    startTransition(async () => {
      const result =
        bookmarkTarget === "contest"
          ? await toggleContestBookmark(scholarshipId)
          : await toggleBookmark(scholarshipId);
      if ("error" in result) {
        setBookmarked(!next);
        if (result.error === "로그인이 필요합니다.") {
          alert("북마크하려면 로그인이 필요합니다.");
        }
        return;
      }
      window.dispatchEvent(
        new CustomEvent(BOOKMARK_EVENT, {
          detail: { scholarshipId, bookmarked: result.bookmarked },
        })
      );
    });
  }

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title, url, text: title });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareHint("링크가 복사되었습니다");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setShareHint("링크가 복사되었습니다");
      } catch {
        setShareHint("공유에 실패했습니다");
      }
    }
  }

  const overlayBtnClass =
    "flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-ink shadow-[0_2px_8px_rgba(0,0,0,0.18)] backdrop-blur-sm transition active:scale-95";

  return (
    <>
      <div className="relative w-full overflow-hidden bg-gray-100">
        <div className="relative h-[min(58vh,420px)] w-full min-h-70">
          {posterUrl ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="absolute inset-0 block h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
              aria-label={`${alt} 크게 보기`}
              aria-haspopup="dialog"
              aria-expanded={open}
            >
              <Image
                src={posterUrl}
                alt={alt}
                fill
                priority
                sizes="100vw"
                className="object-cover object-top"
                unoptimized={unoptimizedPoster}
              />
            </button>
          ) : (
            <div
              className={`absolute inset-0 flex items-center justify-center bg-linear-to-br ${posterPlaceholderGradient}`}
            >
              <span className="text-6xl font-bold text-white/35">{organizationInitial}</span>
            </div>
          )}

          {/* Top overlay actions */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={handleBack}
              aria-label="뒤로가기"
              className={`pointer-events-auto ${overlayBtnClass}`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>

            <div className="pointer-events-auto flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleShare}
                aria-label="공유하기"
                className={overlayBtnClass}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
              </button>

              {showBookmark ? (
              <button
                type="button"
                onClick={handleBookmark}
                disabled={isPending}
                aria-label={bookmarked ? "스크랩 해제" : "스크랩하기"}
                className={`${overlayBtnClass} disabled:opacity-60`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`h-5 w-5 transition-colors ${
                    bookmarked ? "fill-brand stroke-brand" : "fill-none stroke-ink"
                  }`}
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
                  />
                </svg>
              </button>
              ) : null}
            </div>
          </div>

          {shareHint ? (
            <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              {shareHint}
            </div>
          ) : null}
        </div>
      </div>

      {open && posterUrl && portalTarget
        ? createPortal(
            <div
              className="fixed inset-0 z-200 flex items-center justify-center bg-black/85 p-6 sm:p-10 backdrop-blur-[2px]"
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
                <Image
                  src={posterUrl}
                  alt=""
                  width={1200}
                  height={1800}
                  className="max-h-[min(72vh,640px)] w-full max-w-full rounded-lg object-contain shadow-2xl"
                  unoptimized={unoptimizedPoster}
                />
              </div>
            </div>,
            portalTarget
          )
        : null}
    </>
  );
}
