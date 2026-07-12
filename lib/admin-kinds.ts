import { contentKindLabel } from "@/lib/content-categories";

/** Admin content / review kinds (home categories minus "all") */
export const ADMIN_CONTENT_KINDS = [
  "scholarship",
  "contest",
  "education",
  "activity",
] as const;

export type AdminContentKind = (typeof ADMIN_CONTENT_KINDS)[number];

export type ContestContentKind = Exclude<AdminContentKind, "scholarship">;

export const CONTEST_CONTENT_KINDS: ContestContentKind[] = [
  "contest",
  "education",
  "activity",
];

export function isAdminContentKind(value: string | null | undefined): value is AdminContentKind {
  return (
    value === "scholarship" ||
    value === "contest" ||
    value === "education" ||
    value === "activity"
  );
}

export function isContestContentKind(
  value: string | null | undefined
): value is ContestContentKind {
  return value === "contest" || value === "education" || value === "activity";
}

export function parseAdminContentKind(
  value: string | null | undefined,
  fallback: AdminContentKind = "scholarship"
): AdminContentKind {
  return isAdminContentKind(value) ? value : fallback;
}

export function adminKindLabel(kind: AdminContentKind): string {
  return contentKindLabel(kind);
}

export function contentPath(kind: AdminContentKind, extra?: Record<string, string>): string {
  const qs = new URLSearchParams({ kind, ...extra });
  return `/admin/content?${qs.toString()}`;
}

export function reviewPath(kind: AdminContentKind, extra?: Record<string, string>): string {
  const qs = new URLSearchParams({ kind, ...extra });
  return `/admin/review?${qs.toString()}`;
}

export function contentEditPath(kind: AdminContentKind, id: number): string {
  if (kind === "scholarship") return `/admin/content/scholarships/${id}/edit`;
  return `/admin/content/contests/${id}/edit?kind=${kind}`;
}

export function contentNewPath(kind: AdminContentKind): string {
  if (kind === "scholarship") return `/admin/content/scholarships/new`;
  return `/admin/content/contests/new?kind=${kind}`;
}

export function reviewDetailPath(kind: AdminContentKind, id: number): string {
  if (kind === "scholarship") return `/admin/review/scholarships/${id}`;
  return `/admin/review/contests/${id}?kind=${kind}`;
}
