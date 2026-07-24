import type { CardScholarship } from "@/components/ScholarshipCard";
import {
  daysUntilApplyDeadlineKorea,
  isAlwaysOpenRecruitment,
  isScholarshipExpired,
} from "@/lib/scholarship-dates";
import {
  interestJobLabel,
  normalizeInterestCategories,
  type InterestJobId,
} from "@/lib/interestCategories";
import { fieldCodesForInterest } from "@/lib/interest-field-map";
import {
  getForYouWeights,
  type ForYouWeights,
} from "@/lib/home-ranking-weights";

export const HOME_FOR_YOU_LIMIT = 16;
export const HOME_URGENT_BOOKMARK_DAYS = 14;
export const HOME_TOP10_LIMIT = 10;
export const HOME_TOP10_MIN = 5;
export const HOME_INTEREST_RAIL_LIMIT = 3;
export const HOME_RAIL_ITEM_LIMIT = 16;
export const HOME_RAIL_MIN_ITEMS = 4;
export const HOME_CONTINUE_LIMIT = 16;
export const HOME_MAX_PER_ORG = 3;

export type HomeRail = {
  key: string;
  title: string;
  subtitle?: string;
  href?: string;
  items: CardScholarship[];
};

/** 마감이 가까울수록 높음. 상시모집·만료는 낮음. */
function deadlineUrgencyScore(applyEndDate: string): number {
  if (isAlwaysOpenRecruitment(applyEndDate)) return 0;
  const days = daysUntilApplyDeadlineKorea(applyEndDate);
  if (Number.isNaN(days) || days < 0) return -100;
  if (days <= 3) return 120 - days * 4;
  if (days <= 14) return 80 - days;
  if (days <= 30) return 40 - days / 2;
  return 10;
}

export function cardItemKey(item: CardScholarship) {
  return `${item.content_kind ?? "scholarship"}-${item.id}`;
}

function sortByDeadline(list: CardScholarship[]) {
  return [...list].sort((a, b) => {
    if (a.is_recommended && !b.is_recommended) return -1;
    if (!a.is_recommended && b.is_recommended) return 1;
    return (
      daysUntilApplyDeadlineKorea(a.apply_end_date) -
      daysUntilApplyDeadlineKorea(b.apply_end_date)
    );
  });
}

/** Phase A For You: 추천 핀 → 마감 임박 → 스크랩/조회 */
export function rankForYou(items: CardScholarship[]): CardScholarship[] {
  return [...items].sort((a, b) => {
    if (a.is_recommended && !b.is_recommended) return -1;
    if (!a.is_recommended && b.is_recommended) return 1;

    const ua = deadlineUrgencyScore(a.apply_end_date);
    const ub = deadlineUrgencyScore(b.apply_end_date);
    if (ua !== ub) return ub - ua;

    const scrapDiff = (b.scrap_count ?? 0) - (a.scrap_count ?? 0);
    if (scrapDiff !== 0) return scrapDiff;
    return (b.view_count ?? 0) - (a.view_count ?? 0);
  });
}

function interestOverlapScore(
  item: CardScholarship,
  interests: InterestJobId[]
): number {
  if (interests.length === 0) return 0;
  const itemInterests = new Set(item.interest_categories ?? []);
  let score = 0;
  for (const interest of interests) {
    if (itemInterests.has(interest)) score += 2;
    const fields = fieldCodesForInterest(interest);
    const itemFields = item.qual_field_codes ?? [];
    if (itemFields.some((f) => fields.includes(f))) score += 1;
  }
  return score;
}

function recentAffinityScore(
  item: CardScholarship,
  recent: CardScholarship[]
): number {
  if (recent.length === 0) return 0;
  const recentKeys = new Set(recent.map(cardItemKey));
  if (recentKeys.has(cardItemKey(item))) return -5;

  let score = 0;
  const kind = item.content_kind ?? "scholarship";
  for (const r of recent.slice(0, 8)) {
    if ((r.content_kind ?? "scholarship") === kind) score += 0.3;
    if (
      r.organization &&
      item.organization &&
      r.organization === item.organization
    ) {
      score += 1.2;
    }
    const rInterests = new Set(r.interest_categories ?? []);
    for (const ic of item.interest_categories ?? []) {
      if (rInterests.has(ic)) score += 0.8;
    }
  }
  return score;
}

/** 저장한 공고와의 콘텐츠 유사도 (기관·관심사·계열) */
export function similarToSavedScore(
  item: CardScholarship,
  saved: CardScholarship[]
): number {
  if (saved.length === 0) return 0;
  let score = 0;
  const kind = item.content_kind ?? "scholarship";
  for (const s of saved.slice(0, 12)) {
    if ((s.content_kind ?? "scholarship") === kind) score += 0.25;
    if (
      s.organization &&
      item.organization &&
      s.organization === item.organization
    ) {
      score += 1.6;
    }
    const sInterests = new Set(s.interest_categories ?? []);
    for (const ic of item.interest_categories ?? []) {
      if (sInterests.has(ic)) score += 1.1;
    }
    const sFields = new Set(s.qual_field_codes ?? []);
    for (const f of item.qual_field_codes ?? []) {
      if (sFields.has(f)) score += 0.9;
    }
  }
  return score;
}

/** 스크랩·조회 기반 인기 (로그 감쇠) */
export function popularityScore(item: CardScholarship): number {
  const scraps = item.scrap_count ?? 0;
  const views = item.view_count ?? 0;
  return Math.log1p(scraps) * 3 + Math.log1p(views);
}

function forYouScore(
  item: CardScholarship,
  interests: InterestJobId[],
  saved: CardScholarship[],
  recent: CardScholarship[],
  cfKeys: ReadonlySet<string>,
  weights: ForYouWeights
): number {
  return (
    interestOverlapScore(item, interests) * weights.interest +
    similarToSavedScore(item, saved) * weights.similarSaved +
    popularityScore(item) * weights.popularity +
    (item.is_recommended ? weights.recommended : 0) +
    deadlineUrgencyScore(item.apply_end_date) * weights.deadline +
    recentAffinityScore(item, recent) * weights.recent +
    (cfKeys.has(cardItemKey(item)) ? weights.collaborative : 0)
  );
}

/**
 * 회원님을 위한 엄선 랭킹:
 * L1 관심사 + 저장 유사 + 인기 (+ 소량 에디토리얼/CF).
 */
export function softRankForYou(
  items: CardScholarship[],
  options: {
    interests?: readonly string[] | null;
    savedItems?: CardScholarship[];
    recentViews?: CardScholarship[];
    collaborativeKeys?: ReadonlySet<string>;
    weights?: ForYouWeights;
  } = {}
): CardScholarship[] {
  const interests = normalizeInterestCategories(options.interests);
  const saved = options.savedItems ?? [];
  const recent = options.recentViews ?? [];
  const cfKeys = options.collaborativeKeys ?? new Set<string>();
  const weights = options.weights ?? getForYouWeights();

  return [...items].sort(
    (a, b) =>
      forYouScore(b, interests, saved, recent, cfKeys, weights) -
      forYouScore(a, interests, saved, recent, cfKeys, weights)
  );
}

/**
 * 홈 카탈로그에서 For You 선반 생성 (자격 hard filter 없음).
 */
export function buildForYouCurated(
  catalog: CardScholarship[],
  options: {
    interests?: readonly string[] | null;
    savedItems?: CardScholarship[];
    recentViews?: CardScholarship[];
    collaborativeKeys?: ReadonlySet<string>;
    excludeKeys?: ReadonlySet<string>;
  } = {}
): CardScholarship[] {
  const saved = options.savedItems ?? [];
  const savedKeys = new Set(saved.map(cardItemKey));
  const exclude = options.excludeKeys ?? new Set<string>();

  const candidates = catalog.filter((item) => {
    const key = cardItemKey(item);
    if (exclude.has(key) || savedKeys.has(key)) return false;
    if (isScholarshipExpired(item.apply_end_date)) return false;
    return true;
  });

  const ranked = softRankForYou(candidates, {
    interests: options.interests,
    savedItems: saved,
    recentViews: options.recentViews,
    collaborativeKeys: options.collaborativeKeys,
  });

  return applyOrgDiversity(ranked).slice(0, HOME_FOR_YOU_LIMIT);
}

/** 기관 다양성: 동일 organization 상한 */
export function applyOrgDiversity(
  items: CardScholarship[],
  maxPerOrg: number = HOME_MAX_PER_ORG
): CardScholarship[] {
  const counts = new Map<string, number>();
  const out: CardScholarship[] = [];
  for (const item of items) {
    const org = (item.organization || "").trim() || "__none__";
    const n = counts.get(org) ?? 0;
    if (n >= maxPerOrg) continue;
    counts.set(org, n + 1);
    out.push(item);
  }
  return out;
}

/** 레일 아이템에서 이미 노출된 키 제거 + 기관 다양성 */
export function finalizeRailItems(
  items: CardScholarship[],
  excludeKeys: ReadonlySet<string>,
  limit: number = HOME_RAIL_ITEM_LIMIT
): CardScholarship[] {
  const filtered = items.filter((item) => !excludeKeys.has(cardItemKey(item)));
  return applyOrgDiversity(filtered).slice(0, limit);
}

export function buildCollaborativeRail(
  items: CardScholarship[],
  excludeKeys: ReadonlySet<string> = new Set()
): HomeRail | null {
  const finalized = finalizeRailItems(items, excludeKeys);
  if (finalized.length < HOME_RAIL_MIN_ITEMS) return null;
  return {
    key: "collaborative",
    title: "비슷한 분들이 저장한 공고",
    subtitle: "북마크 패턴 기반 추천",
    href: "/browse?sort=scraps",
    items: finalized,
  };
}

export function sortByTrending(items: CardScholarship[]): CardScholarship[] {
  return [...items].sort((a, b) => {
    const scrapDiff = (b.scrap_count ?? 0) - (a.scrap_count ?? 0);
    if (scrapDiff !== 0) return scrapDiff;
    return (b.view_count ?? 0) - (a.view_count ?? 0);
  });
}

/** 저장한 공고 중 마감 N일 이내 */
export function filterUrgentBookmarks(
  items: CardScholarship[],
  withinDays: number = HOME_URGENT_BOOKMARK_DAYS
): CardScholarship[] {
  return items
    .filter((s) => {
      if (isAlwaysOpenRecruitment(s.apply_end_date)) return false;
      const days = daysUntilApplyDeadlineKorea(s.apply_end_date);
      return !Number.isNaN(days) && days >= 0 && days <= withinDays;
    })
    .sort(
      (a, b) =>
        daysUntilApplyDeadlineKorea(a.apply_end_date) -
        daysUntilApplyDeadlineKorea(b.apply_end_date)
    );
}

export function pickHomeHero(options: {
  forYou: CardScholarship[];
  catalog: CardScholarship[];
}): CardScholarship | null {
  if (options.forYou.length > 0) return options.forYou[0];

  const recommended = options.catalog
    .filter((s) => s.is_recommended && !isScholarshipExpired(s.apply_end_date))
    .sort((a, b) => {
      const ao = a.recommended_sort_order ?? 9999;
      const bo = b.recommended_sort_order ?? 9999;
      if (ao !== bo) return ao - bo;
      return (
        daysUntilApplyDeadlineKorea(a.apply_end_date) -
        daysUntilApplyDeadlineKorea(b.apply_end_date)
      );
    });
  if (recommended.length > 0) return recommended[0];

  const trending = sortByTrending(options.catalog);
  return trending[0] ?? null;
}

/** TOP 10 후보 — 개인화 레일과 연속 중복을 줄이기 위해 excludeKeys 제외 */
export function buildTop10(
  catalog: CardScholarship[],
  excludeKeys: ReadonlySet<string> = new Set()
): CardScholarship[] {
  const ranked = applyOrgDiversity(
    sortByTrending(catalog).filter((s) => !excludeKeys.has(cardItemKey(s)))
  );
  const top = ranked.slice(0, HOME_TOP10_LIMIT);
  if (top.length < HOME_TOP10_MIN) {
    const fallback = applyOrgDiversity(sortByTrending(catalog)).slice(
      0,
      HOME_TOP10_LIMIT
    );
    return fallback.length >= HOME_TOP10_MIN ? fallback : [];
  }
  return top;
}

function itemMatchesInterest(
  item: CardScholarship,
  interestId: InterestJobId
): boolean {
  if ((item.interest_categories ?? []).includes(interestId)) return true;
  const fields = fieldCodesForInterest(interestId);
  if (fields.length === 0) return false;
  return (item.qual_field_codes ?? []).some((f) => fields.includes(f));
}

/** 관심사별 동적 레일 (최대 3개, 항목 부족 시 숨김) */
export function buildInterestRails(
  catalog: CardScholarship[],
  rawInterests: readonly string[] | null | undefined,
  excludeKeys: ReadonlySet<string> = new Set()
): HomeRail[] {
  const interests = normalizeInterestCategories(rawInterests).slice(
    0,
    HOME_INTEREST_RAIL_LIMIT
  );
  const rails: HomeRail[] = [];

  for (const interestId of interests) {
    const label = interestJobLabel(interestId);
    const items = finalizeRailItems(
      sortByDeadline(
        catalog.filter((item) => itemMatchesInterest(item, interestId))
      ),
      excludeKeys
    );

    if (items.length < HOME_RAIL_MIN_ITEMS) continue;

    rails.push({
      key: `interest-${interestId}`,
      title: `${label} 관심 공고`,
      subtitle: "관심사에 맞는 추천",
      href: "/browse",
      items,
    });
  }

  return rails;
}

export type HomeProfileSignals = {
  schoolName?: string | null;
  schoolLocation?: string | null;
  address?: string | null;
};

/** 교내 전용 레일 */
export function buildCampusRail(
  campusItems: CardScholarship[],
  profile: HomeProfileSignals,
  excludeKeys: ReadonlySet<string> = new Set()
): HomeRail | null {
  const school = profile.schoolName?.trim();
  const items = finalizeRailItems(sortByDeadline(campusItems), excludeKeys);

  if (items.length < HOME_RAIL_MIN_ITEMS) return null;

  const title = school
    ? `${school} 학생을 위한 교내 공고`
    : "우리 학교 교내 공고";

  return {
    key: "campus",
    title,
    subtitle: "우리 대학에 해당하는 장학금",
    href: "/matched?scope=campus",
    items,
  };
}

/** 지역·학교 소재 레일 */
export function buildRegionRail(
  catalog: CardScholarship[],
  profile: HomeProfileSignals,
  excludeKeys: ReadonlySet<string> = new Set()
): HomeRail | null {
  const address = profile.address?.trim() ?? "";
  const schoolLocation = profile.schoolLocation?.trim() ?? "";
  if (!address && !schoolLocation) return null;

  const items = finalizeRailItems(
    sortByDeadline(
      catalog.filter((item) => {
        const regions = item.qual_region ?? [];
        const locations = item.qual_school_location ?? [];
        const regionHit =
          regions.length > 0 &&
          regions.some(
            (r) =>
              (address && address.includes(r)) ||
              (schoolLocation && schoolLocation.includes(r))
          );
        const locationHit =
          schoolLocation.length > 0 && locations.includes(schoolLocation);
        return regionHit || locationHit;
      })
    ),
    excludeKeys
  );

  if (items.length < HOME_RAIL_MIN_ITEMS) return null;

  return {
    key: "region",
    title: "내 지역·학교 소재 공고",
    subtitle: "거주지·학교 위치를 반영한 추천",
    href: "/browse",
    items,
  };
}

/**
 * 이어서 보기: 서버 조회 이력 우선 + localStorage/긴급 북마크 보강.
 */
export function buildContinueWatching(options: {
  serverRecent: CardScholarship[];
  localRecent?: CardScholarship[];
  urgentBookmarks?: CardScholarship[];
}): CardScholarship[] {
  const seen = new Set<string>();
  const out: CardScholarship[] = [];

  function pushAll(list: CardScholarship[]) {
    for (const item of list) {
      if (isScholarshipExpired(item.apply_end_date)) continue;
      const key = cardItemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= HOME_CONTINUE_LIMIT) return;
    }
  }

  // localStorage가 방금 본 순서를 갖고 있으므로 로컬을 먼저 쓴다.
  // (홈 RSC 캐시의 serverRecent가 앞서면 재조회해도 순서가 안 바뀜)
  pushAll(options.localRecent ?? []);
  pushAll(options.serverRecent);
  pushAll(options.urgentBookmarks ?? []);
  return out;
}

/** 연속 레일 간 중복 키 누적 */
export function collectRailKeys(
  ...lists: Array<CardScholarship[] | undefined>
): Set<string> {
  const keys = new Set<string>();
  for (const list of lists) {
    for (const item of list ?? []) keys.add(cardItemKey(item));
  }
  return keys;
}
