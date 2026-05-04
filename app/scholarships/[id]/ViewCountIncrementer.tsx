"use client";

import { useEffect } from "react";
import { incrementScholarshipViewCount } from "./actions";
import { trackAnalyticsEventClient } from "@/lib/analytics/client";

const VIEW_SESSION_PREFIX = "scholarship-viewed:";
const VIEW_EVENT = "scholarship:view-incremented";

export default function ViewCountIncrementer({
  scholarshipId,
}: {
  scholarshipId: number;
}) {
  useEffect(() => {
    const viewKey = `${VIEW_SESSION_PREFIX}${scholarshipId}`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(viewKey)) return;
    window.sessionStorage.setItem(viewKey, "1");
    void incrementScholarshipViewCount(scholarshipId).then((result) => {
      if (!result?.incremented) return;
      window.dispatchEvent(
        new CustomEvent(VIEW_EVENT, {
          detail: { scholarshipId, viewCount: result.viewCount },
        })
      );
    });
    void trackAnalyticsEventClient({
      eventName: "scholarship_opened",
      scholarshipId,
    });
  }, [scholarshipId]);

  return null;
}
