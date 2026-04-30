"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackAnalyticsEventClient } from "@/lib/analytics/client";

export default function AnalyticsPageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedRef = useRef<string>("");

  useEffect(() => {
    const query = searchParams.toString();
    const routeKey = query ? `${pathname}?${query}` : pathname;
    if (!routeKey || lastTrackedRef.current === routeKey) return;
    lastTrackedRef.current = routeKey;
    void trackAnalyticsEventClient({
      eventName: "page_view",
      pagePath: routeKey,
    });
  }, [pathname, searchParams]);

  return null;
}
