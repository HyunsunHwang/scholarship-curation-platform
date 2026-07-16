/** 브라우저 localStorage에 저장하는 최근 본 공고 (비로그인 포함) */

export type RecentViewItem = {
  id: number;
  name: string;
  organization: string;
  poster_image_url: string | null;
  apply_end_date: string;
  content_kind: "scholarship" | "contest" | "education" | "activity";
  viewedAt: number;
};

export const RECENT_VIEWS_STORAGE_KEY = "janghakssam:recent-views";
export const RECENT_VIEWS_CHANGED_EVENT = "janghakssam:recent-views-changed";
const MAX_RECENT_VIEWS = 24;
const EMPTY_RECENT_VIEWS: RecentViewItem[] = [];
let cachedRaw: string | null = null;
let cachedRecentViews: RecentViewItem[] = EMPTY_RECENT_VIEWS;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readRecentViews(): RecentViewItem[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(RECENT_VIEWS_STORAGE_KEY) ?? "";
    if (raw === cachedRaw) return cachedRecentViews;
    cachedRaw = raw;
    if (!raw) {
      cachedRecentViews = EMPTY_RECENT_VIEWS;
      return cachedRecentViews;
    }
    const parsed = JSON.parse(raw) as unknown;
    cachedRecentViews = Array.isArray(parsed)
      ? parsed.filter(isRecentViewItem).slice(0, MAX_RECENT_VIEWS)
      : EMPTY_RECENT_VIEWS;
    return cachedRecentViews;
  } catch {
    cachedRecentViews = EMPTY_RECENT_VIEWS;
    return cachedRecentViews;
  }
}

export function getRecentViewsServerSnapshot(): RecentViewItem[] {
  return EMPTY_RECENT_VIEWS;
}

export function subscribeRecentViews(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const sync = () => onStoreChange();
  window.addEventListener(RECENT_VIEWS_CHANGED_EVENT, sync);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener(RECENT_VIEWS_CHANGED_EVENT, sync);
    window.removeEventListener("storage", sync);
  };
}

function isRecentViewItem(value: unknown): value is RecentViewItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "number" &&
    typeof v.name === "string" &&
    typeof v.organization === "string" &&
    (v.poster_image_url === null || typeof v.poster_image_url === "string") &&
    typeof v.apply_end_date === "string" &&
    (v.content_kind === "scholarship" ||
      v.content_kind === "contest" ||
      v.content_kind === "education" ||
      v.content_kind === "activity") &&
    typeof v.viewedAt === "number"
  );
}

export function recordRecentView(
  item: Omit<RecentViewItem, "viewedAt"> & { viewedAt?: number }
): RecentViewItem[] {
  if (!canUseStorage()) return [];
  const nextItem: RecentViewItem = {
    ...item,
    viewedAt: item.viewedAt ?? Date.now(),
  };
  const prev = readRecentViews().filter(
    (row) =>
      !(row.id === nextItem.id && row.content_kind === nextItem.content_kind)
  );
  const next = [nextItem, ...prev].slice(0, MAX_RECENT_VIEWS);
  try {
    window.localStorage.setItem(RECENT_VIEWS_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(RECENT_VIEWS_CHANGED_EVENT));
  } catch {
    // quota / private mode — ignore
  }
  return next;
}
