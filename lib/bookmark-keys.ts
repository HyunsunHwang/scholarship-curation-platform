/** 장학금/공모전 ID 충돌을 피하기 위한 북마크 키 */

export function cardBookmarkKey(item: {
  id: number;
  content_kind?: "scholarship" | "contest" | "education" | "activity" | null;
}): string {
  const kind = item.content_kind ?? "scholarship";
  if (kind === "scholarship") return `scholarship:${item.id}`;
  return `contest:${item.id}`;
}
