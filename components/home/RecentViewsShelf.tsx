"use client";

import { useEffect, useMemo, useState } from "react";
import ScholarshipCard, { type CardScholarship } from "@/components/ScholarshipCard";
import {
  readRecentViews,
  RECENT_VIEWS_CHANGED_EVENT,
  type RecentViewItem,
} from "@/lib/recent-views";
import { cardBookmarkKey } from "@/lib/bookmark-keys";
import { isScholarshipExpired } from "@/lib/scholarship-dates";
import { buildContinueWatching } from "@/lib/home-rails";
import HomeSectionTitle from "./HomeSectionTitle";
import HorizontalShelf from "./HorizontalShelf";

function itemKey(item: Pick<CardScholarship, "id" | "content_kind">) {
  return `${item.content_kind ?? "scholarship"}-${item.id}`;
}

function toCard(item: RecentViewItem): CardScholarship {
  return {
    id: item.id,
    name: item.name,
    organization: item.organization,
    institution_type: "기타",
    support_types: [],
    apply_end_date: item.apply_end_date,
    poster_image_url: item.poster_image_url,
    created_at: new Date(item.viewedAt).toISOString(),
    content_kind: item.content_kind,
  };
}

/** 홈 카탈로그에 있으면 지원혜택 문구를 붙여 이어서 보기 폴백을 없앤다 */
function enrichWithCatalog(
  card: CardScholarship,
  catalogByKey: Map<string, CardScholarship>
): CardScholarship {
  const hit = catalogByKey.get(itemKey(card));
  if (!hit) return card;
  return {
    ...card,
    support_amount_text: hit.support_amount_text ?? card.support_amount_text,
    benefits: hit.benefits ?? card.benefits,
    benefit_note: hit.benefit_note ?? card.benefit_note,
    benefit_notice_text: hit.benefit_notice_text ?? card.benefit_notice_text,
    card_support_line: hit.card_support_line ?? card.card_support_line,
    support_types: hit.support_types?.length ? hit.support_types : card.support_types,
    institution_type: hit.institution_type || card.institution_type,
  };
}

export default function RecentViewsShelf({
  bookmarkedKeys = [],
  serverRecent = [],
  catalog = [],
}: {
  bookmarkedKeys?: string[];
  /** 서버 browse_events (로그인) — localStorage와 병합 */
  serverRecent?: CardScholarship[];
  /** 홈 카탈로그 — local 최근본 혜택 보강용 */
  catalog?: CardScholarship[];
}) {
  const [localRecent, setLocalRecent] = useState<CardScholarship[]>([]);
  const bookmarkedSet = useMemo(() => new Set(bookmarkedKeys), [bookmarkedKeys]);
  const catalogByKey = useMemo(() => {
    const map = new Map<string, CardScholarship>();
    for (const item of catalog) map.set(itemKey(item), item);
    return map;
  }, [catalog]);

  useEffect(() => {
    function sync() {
      setLocalRecent(
        readRecentViews()
          .filter((row) => !isScholarshipExpired(row.apply_end_date))
          .map(toCard)
      );
    }
    sync();
    window.addEventListener(RECENT_VIEWS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(RECENT_VIEWS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const items = useMemo(
    () =>
      buildContinueWatching({
        serverRecent: serverRecent.map((card) =>
          enrichWithCatalog(card, catalogByKey)
        ),
        localRecent: localRecent.map((card) =>
          enrichWithCatalog(card, catalogByKey)
        ),
      }),
    [serverRecent, localRecent, catalogByKey]
  );

  if (items.length === 0) return null;

  const hasServer = serverRecent.length > 0;

  return (
    <section aria-labelledby="continue-watching-heading" className="mt-8 sm:mt-10">
      <HomeSectionTitle
        id="continue-watching-heading"
        title="이어서 보기"
        href="/library/recent"
        subtitle={
          hasServer
            ? "여러 기기에서 이어 본 공고"
            : "최근 본 공고를 이어서 살펴보세요"
        }
      />
      <HorizontalShelf
        label="이어서 보기"
        items={items}
        getKey={(s) => `continue-${s.content_kind ?? "scholarship"}-${s.id}`}
        renderItem={(scholarship) => (
          <ScholarshipCard
            scholarship={scholarship}
            initialBookmarked={bookmarkedSet.has(cardBookmarkKey(scholarship))}
          />
        )}
      />
    </section>
  );
}
