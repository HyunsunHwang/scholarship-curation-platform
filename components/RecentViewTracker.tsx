"use client";

import { useEffect } from "react";
import { recordRecentView } from "@/lib/recent-views";

/** 상세 진입 시 최근 본 공고를 localStorage에 기록 (비로그인 포함) */
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
  }, [id, name, organization, posterImageUrl, applyEndDate, contentKind]);

  return null;
}
