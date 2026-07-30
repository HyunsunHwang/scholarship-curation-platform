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
  cardSupportLine = null,
  supportAmountText = null,
  benefits = null,
  benefitNote = null,
}: {
  id: number;
  name: string;
  organization: string;
  posterImageUrl: string | null;
  applyEndDate: string;
  contentKind: "scholarship" | "contest" | "education" | "activity";
  /** 상세 혜택 하이라이트와 동일 문구 */
  cardSupportLine?: string | null;
  supportAmountText?: string | null;
  benefits?: string[] | null;
  benefitNote?: string | null;
}) {
  useEffect(() => {
    recordRecentView({
      id,
      name,
      organization,
      poster_image_url: posterImageUrl,
      apply_end_date: applyEndDate,
      content_kind: contentKind,
      card_support_line: cardSupportLine,
      support_amount_text: supportAmountText,
      benefits,
      benefit_note: benefitNote,
    });
    void trackBrowseEventClient({
      contentKind,
      contentId: id,
      name,
      organization,
      posterImageUrl,
      applyEndDate,
    });
  }, [
    id,
    name,
    organization,
    posterImageUrl,
    applyEndDate,
    contentKind,
    cardSupportLine,
    supportAmountText,
    benefits,
    benefitNote,
  ]);

  return null;
}
