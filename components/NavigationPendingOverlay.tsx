"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * 빠른 RSC 전환에서는 오버레이를 띄우지 않고,
 * 전환이 OVERLAY_DELAY_MS 이상 걸릴 때만 얇은 상단 진행 바를 표시한다.
 * (이전 풀스크린 스켈레톤은 체감 지연을 키웠음)
 */
const OVERLAY_DELAY_MS = 200;

export default function NavigationPendingOverlay({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [pending, setPending] = useState(false);
  const delayTimerRef = useRef<number | null>(null);

  function clearDelayTimer() {
    if (delayTimerRef.current != null) {
      window.clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
  }

  useEffect(() => {
    clearDelayTimer();
    setPending(false);
  }, [routeKey]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(false), 2500);
    return () => window.clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    function handleCaptureClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const interactiveElement = target?.closest?.(
        "button, [role='button'], input, select, textarea, summary, [data-skip-nav-pending]"
      );
      if (interactiveElement && interactiveElement.tagName !== "A") return;

      const anchor = target?.closest?.("a");
      if (!anchor) return;

      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const hrefAttr = anchor.getAttribute("href");
      if (!hrefAttr?.startsWith("/")) return;

      let url: URL;
      try {
        url = new URL(hrefAttr, window.location.origin);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;

      const nextPathSearch = `${url.pathname}${url.search}`;
      const currentPathSearch = `${window.location.pathname}${window.location.search}`;
      if (nextPathSearch === currentPathSearch) return;

      clearDelayTimer();
      delayTimerRef.current = window.setTimeout(() => {
        setPending(true);
      }, OVERLAY_DELAY_MS);
    }

    document.addEventListener("click", handleCaptureClick, true);
    return () => {
      document.removeEventListener("click", handleCaptureClick, true);
      clearDelayTimer();
    };
  }, []);

  return (
    <>
      {children}
      {pending && (
        <div
          role="progressbar"
          aria-busy="true"
          aria-label="페이지 불러오는 중"
          className="pointer-events-none fixed inset-x-0 top-0 z-100 h-0.5 overflow-hidden bg-transparent"
        >
          <div className="h-full w-1/3 animate-pulse bg-brand" />
        </div>
      )}
    </>
  );
}
