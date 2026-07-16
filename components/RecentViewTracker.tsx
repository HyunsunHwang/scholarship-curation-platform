"use client";

import { useEffect } from "react";
import { recordRecentView } from "@/lib/recent-views";
import { trackBrowseEventClient } from "@/lib/browse-events";

/** 상세 진입 시 localStorage + (로그인 시) browse_events 기록 */
export default function RecentViewTracker({
  id,
  name,
  organization,
  posterImageUrl,
  applyEndDate,
  contentKind,
}: {
  id: number;
  name: string;
  organization: string;
  posterImageUrl: string | null;
  applyEndDate: string;
  contentKind: "scholarship" | "contest" | "education" | "activity";
}) {
  useEffect(() => {
    recordRecentView({
      id,
      name,
      organization,
      poster_image_url: posterImageUrl,
      apply_end_date: applyEndDate,
      content_kind: contentKind,
    });
    void trackBrowseEventClient({
      contentKind,
      contentId: id,
      name,
      organization,
      posterImageUrl,
      applyEndDate,
    });
  }, [id, name, organization, posterImageUrl, applyEndDate, contentKind]);

  return null;
}
