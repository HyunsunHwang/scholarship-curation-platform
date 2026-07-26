/**
 * 프로필 아바타·배너 이미지 (Supabase Storage).
 * 경로: {userId}/avatar|banner/{uuid}.{ext}
 */

export const PROFILE_MEDIA_BUCKET = "profile-media";
export const PROFILE_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

export const PROFILE_MEDIA_ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type ProfileMediaKind = "avatar" | "banner";

const ALLOWED_MIME_SET = new Set<string>(PROFILE_MEDIA_ALLOWED_MIME);

export function isAllowedProfileMediaMime(
  mime: string | null | undefined
): boolean {
  if (!mime) return false;
  return ALLOWED_MIME_SET.has(mime);
}

export function profileMediaExtFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

/** 공개 URL에서 버킷 상대 경로 추출. 우리 버킷이 아니면 null. */
export function storagePathFromProfileMediaUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${PROFILE_MEDIA_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
  return path || null;
}
