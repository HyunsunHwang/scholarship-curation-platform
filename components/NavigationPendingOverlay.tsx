"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import NavbarSkeleton from "@/components/skeletons/NavbarSkeleton";
import { Skeleton } from "@/components/skeletons/skeleton";

/**
 * Next.js `loading.tsx`만으로는 프리패치·빠른 RSC 전환 때문에 로딩 UI가 거의 안 보일 수 있음.
 * 같은 도메인 내부 링크 클릭 시 스켈레톤 오버레이를 올려 체감 로딩을 보장한다.
 */
export default function NavigationPendingOverlay({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPending(false));
    return () => cancelAnimationFrame(frame);
  }, [routeKey]);

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

      flushSync(() => {
        setPending(true);
      });
    }

    document.addEventListener("click", handleCaptureClick, true);
    return () =>
      document.removeEventListener("click", handleCaptureClick, true);
  }, []);

  return (
    <>
      {children}
      {pending && (
        <div
          role="progressbar"
          aria-busy="true"
          aria-label="페이지 불러오는 중"
          className="fixed inset-0 z-100 flex cursor-wait flex-col bg-white/90 backdrop-blur-sm pointer-events-auto"
        >
          <NavbarSkeleton />
          <div className="flex flex-1 flex-col overflow-y-auto px-4 py-10 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-7xl space-y-10">
              <div className="grid gap-10 lg:grid-cols-2">
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full max-w-md" />
                  <Skeleton className="h-10 w-4/5 max-w-sm" />
                  <Skeleton className="h-4 w-full max-w-lg" />
                  <div className="flex gap-3 pt-4">
                    <Skeleton className="h-12 w-36 rounded-xl" />
                    <Skeleton className="h-12 w-28 rounded-xl" />
                  </div>
                </div>
                <Skeleton className="hidden aspect-square max-h-[min(100%,380px)] w-full rounded-3xl lg:block" />
              </div>
              <div className="rounded-3xl border border-gray-100 bg-beige/80 p-6">
                <div className="mb-6 flex flex-wrap gap-2">
                  <Skeleton className="h-9 w-24 rounded-full" />
                  <Skeleton className="h-9 w-28 rounded-full" />
                  <Skeleton className="h-9 w-20 rounded-full" />
                </div>
                <Skeleton className="mb-8 h-11 max-w-xl rounded-xl" />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <Skeleton className="aspect-2/3 w-full rounded-xl sm:rounded-2xl" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
