"use client";

import { useEffect } from "react";
import { incrementContestViewCount } from "@/app/contests/[id]/actions";
import { trackAnalyticsEventClient } from "@/lib/analytics/client";

const VIEW_SESSION_PREFIX = "contest-viewed:";
const VIEW_EVENT = "scholarship:view-incremented";

export default function ContestViewCountIncrementer({
  contestId,
}: {
  contestId: number;
}) {
  useEffect(() => {
    const viewKey = `${VIEW_SESSION_PREFIX}${contestId}`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(viewKey)) return;
    window.sessionStorage.setItem(viewKey, "1");
    void incrementContestViewCount(contestId).then((result) => {
      if (!result?.incremented) return;
      window.dispatchEvent(
        new CustomEvent(VIEW_EVENT, {
          detail: { scholarshipId: contestId, viewCount: result.viewCount },
        })
      );
    });
    void trackAnalyticsEventClient({
      eventName: "contest_opened",
      metadata: { contest_id: contestId },
    });
  }, [contestId]);

  return null;
}
