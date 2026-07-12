"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackAnalyticsEventClient } from "@/lib/analytics/client";

/** 네비게이션 직후 메인 스레드를 막지 않도록 page_view를 짧게 지연 */
const TRACK_DELAY_MS = 400;

export default function AnalyticsPageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedRef = useRef<string>("");

  useEffect(() => {
    const query = searchParams.toString();
    const routeKey = query ? `${pathname}?${query}` : pathname;
    if (!routeKey || lastTrackedRef.current === routeKey) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled || lastTrackedRef.current === routeKey) return;
      lastTrackedRef.current = routeKey;
      void trackAnalyticsEventClient({
        eventName: "page_view",
        pagePath: routeKey,
      });
    }, TRACK_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname, searchParams]);

  return null;
}
