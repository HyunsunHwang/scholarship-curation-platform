"use client";

import { useMemo, useSyncExternalStore } from "react";
import ScholarshipCard, { type CardScholarship } from "@/components/ScholarshipCard";
import {
  getRecentViewsServerSnapshot,
  readRecentViews,
  subscribeRecentViews,
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
    support_amount_text: item.support_amount_text ?? null,
    benefits: item.benefits ?? null,
    benefit_note: item.benefit_note ?? null,
    card_support_line: item.card_support_line ?? null,
  };
}

/** 홈 카탈로그·서버 최근본에 있으면 지원혜택 문구를 붙여 이어서 보기 폴백을 없앤다 */
function enrichWithSource(
  card: CardScholarship,
  sourceByKey: Map<string, CardScholarship>
): CardScholarship {
  const hit = sourceByKey.get(itemKey(card));
  if (!hit) return card;
  const curLine = card.card_support_line?.trim() || "";
  const hitLine = hit.card_support_line?.trim() || "";
  const curLineOk = Boolean(curLine && curLine !== "기관 확인 필요");
  const hitLineOk = Boolean(hitLine && hitLine !== "기관 확인 필요");
  return {
    ...card,
    support_amount_text: hit.support_amount_text ?? card.support_amount_text,
    benefits: hit.benefits?.length ? hit.benefits : card.benefits,
    benefit_note: hit.benefit_note ?? card.benefit_note,
    benefit_notice_text: hit.benefit_notice_text ?? card.benefit_notice_text,
    card_support_line: hitLineOk
      ? hitLine
      : curLineOk
        ? curLine
        : hitLine || curLine || null,
    support_types: hit.support_types?.length
      ? hit.support_types
      : card.support_types,
    institution_type:
      hit.institution_type && hit.institution_type !== "기타"
        ? hit.institution_type
        : card.institution_type,
    poster_image_url: hit.poster_image_url ?? card.poster_image_url,
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
  const localRows = useSyncExternalStore(
    subscribeRecentViews,
    readRecentViews,
    getRecentViewsServerSnapshot
  );
  const bookmarkedSet = useMemo(() => new Set(bookmarkedKeys), [bookmarkedKeys]);
  const catalogByKey = useMemo(() => {
    const map = new Map<string, CardScholarship>();
    for (const item of catalog) map.set(itemKey(item), item);
    return map;
  }, [catalog]);
  const serverByKey = useMemo(() => {
    const map = new Map<string, CardScholarship>();
    for (const item of serverRecent) map.set(itemKey(item), item);
    return map;
  }, [serverRecent]);

  const localRecent = useMemo(
    () =>
      localRows
        .filter((row) => !isScholarshipExpired(row.apply_end_date))
        .map(toCard)
        // localStorage 스텁 → 서버 최근본 → 홈 카탈로그 순으로 혜택 보강
        .map((card) => enrichWithSource(card, serverByKey))
        .map((card) => enrichWithSource(card, catalogByKey)),
    [localRows, serverByKey, catalogByKey]
  );

  const items = useMemo(
    () =>
      buildContinueWatching({
        serverRecent: serverRecent.map((card) =>
          enrichWithSource(card, catalogByKey)
        ),
        localRecent,
      }),
    [serverRecent, localRecent, catalogByKey]
  );

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="continue-watching-heading" className="mt-8 sm:mt-10">
      <HomeSectionTitle
        id="continue-watching-heading"
        title="이어서 보기"
        href="/library/recent"
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
