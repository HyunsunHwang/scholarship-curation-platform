/**
 * 경험 결과물 첨부 (링크·파일).
 * 담당자 카드/공유에도 그대로 노출할 수 있도록 공개 URL을 저장한다.
 */

export const PROFILE_ARTIFACTS_BUCKET = "profile-artifacts";
/** 프로필 전체(모든 경험 항목 합산) 파일 첨부 상한 */
export const PROFILE_FILE_MAX = 5;
export const PROFILE_FILE_MAX_BYTES = 10 * 1024 * 1024;
/** 항목당 링크 남용 방지용 소프트 캡 (UI에서는 안내만) */
export const PROFILE_LINK_SOFT_MAX = 20;

export const PROFILE_ARTIFACT_ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export type SpecLinkArtifact = {
  id: string;
  kind: "link";
  url: string;
  title: string | null;
};

export type SpecFileArtifact = {
  id: string;
  kind: "file";
  /** storage path: {userId}/{uuid}_{filename} */
  path: string;
  url: string;
  name: string;
  mime_type: string | null;
  size: number | null;
};

export type SpecArtifact = SpecLinkArtifact | SpecFileArtifact;

const ALLOWED_MIME_SET = new Set<string>(PROFILE_ARTIFACT_ALLOWED_MIME);

export function isAllowedArtifactMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return ALLOWED_MIME_SET.has(mime);
}

export function countFileArtifacts(
  artifacts: readonly SpecArtifact[] | null | undefined
): number {
  if (!artifacts?.length) return 0;
  return artifacts.filter((a) => a.kind === "file").length;
}

/** 여러 경험 항목의 파일 개수 합 */
export function countProfileFiles(
  items: readonly { artifacts?: SpecArtifact[] | null }[]
): number {
  return items.reduce((sum, item) => sum + countFileArtifacts(item.artifacts), 0);
}

function asTrimmedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** DB/클라이언트에서 온 값을 안전한 SpecArtifact[]로 정리 */
export function normalizeArtifacts(
  raw: unknown,
  options?: { maxLinks?: number }
): SpecArtifact[] {
  if (!Array.isArray(raw)) return [];
  const maxLinks = options?.maxLinks ?? PROFILE_LINK_SOFT_MAX;
  const out: SpecArtifact[] = [];
  let linkCount = 0;

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const id =
      typeof rec.id === "string" && rec.id.trim()
        ? rec.id.trim().slice(0, 80)
        : cryptoRandomId();
    const kind = rec.kind;

    if (kind === "link") {
      if (linkCount >= maxLinks) continue;
      const url = asTrimmedString(rec.url, 2000);
      if (!url || !isHttpUrl(url)) continue;
      out.push({
        id,
        kind: "link",
        url,
        title: asTrimmedString(rec.title, 120),
      });
      linkCount += 1;
      continue;
    }

    if (kind === "file") {
      const path = asTrimmedString(rec.path, 500);
      const url = asTrimmedString(rec.url, 2000);
      const name = asTrimmedString(rec.name, 200);
      if (!path || !url || !name) continue;
      const mime =
        typeof rec.mime_type === "string" ? rec.mime_type.slice(0, 120) : null;
      const size =
        typeof rec.size === "number" && Number.isFinite(rec.size)
          ? Math.max(0, Math.floor(rec.size))
          : null;
      out.push({
        id,
        kind: "file",
        path,
        url,
        name,
        mime_type: mime,
        size,
      });
    }
  }

  return out;
}

export function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 저장 경로용 파일명 정리 */
export function sanitizeArtifactFileName(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "file";
  return base.slice(0, 120);
}
