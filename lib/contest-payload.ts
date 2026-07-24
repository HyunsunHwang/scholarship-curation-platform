import type { ContestDocumentFile, Database, SelectionStagePhase } from "@/lib/database.types";
import {
  getAdminReturnPath,
  parseJsonTextArray,
  parseOptionalInt,
  parseTextArray,
} from "@/lib/scholarship-payload";
import {
  INTEREST_CONTEST_MAX,
  isInterestJobId,
  type InterestJobId,
} from "@/lib/interestCategories";
import type { ContestContentKind } from "@/lib/admin-kinds";
import { isContestContentKind } from "@/lib/admin-kinds";

export type ContestInsert = Database["public"]["Tables"]["contests"]["Insert"];
export type ContestSelectionStageInsert =
  Database["public"]["Tables"]["contest_selection_stages"]["Insert"];

function parseInterestCategories(val: string | null): InterestJobId[] {
  const items = parseTextArray(val);
  const seen = new Set<InterestJobId>();
  const out: InterestJobId[] = [];
  for (const item of items) {
    if (!isInterestJobId(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= INTEREST_CONTEST_MAX) break;
  }
  return out;
}

function parseDocumentFiles(val: string | null): ContestDocumentFile[] {
  if (!val || val.trim() === "") return [];
  try {
    const parsed = JSON.parse(val) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ContestDocumentFile[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const url = typeof row.url === "string" ? row.url.trim() : "";
      if (!name || !url) continue;
      out.push({
        name,
        url,
        source_url: typeof row.source_url === "string" ? row.source_url : null,
        mime_type: typeof row.mime_type === "string" ? row.mime_type : null,
        size: typeof row.size === "number" ? row.size : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function parseContestContentKind(
  val: string | null,
  fallback: ContestContentKind = "contest"
): ContestContentKind {
  return isContestContentKind(val) ? val : fallback;
}

export function buildContestPayload(
  formData: FormData,
  lockedKind?: ContestContentKind
): ContestInsert {
  const kind =
    lockedKind ??
    parseContestContentKind((formData.get("content_kind") as string) || null);

  // hidden+checkbox 패턴은 formData.get()이 hidden(false)을 먼저 반환하므로
  // getAll()로 "true"가 포함됐는지 확인해야 함 (scholarship-payload와 동일)
  const bool = (key: string) => formData.getAll(key).includes("true");

  return {
    name: ((formData.get("name") as string) || "").trim(),
    organization: ((formData.get("organization") as string) || "").trim(),
    organization_type: ((formData.get("organization_type") as string) || "").trim() || null,
    content_kind: kind,
    support_amount_text:
      ((formData.get("support_amount_text") as string) || "").trim() || null,
    selection_count: parseOptionalInt(formData.get("selection_count") as string | null),
    apply_start_date: ((formData.get("apply_start_date") as string) || "").trim() || null,
    apply_end_date: ((formData.get("apply_end_date") as string) || "").trim() || null,
    announcement_date: ((formData.get("announcement_date") as string) || "").trim() || null,
    targets: parseTextArray(formData.get("targets") as string | null),
    benefits: parseTextArray(formData.get("benefits") as string | null),
    apply_types: parseTextArray(formData.get("apply_types") as string | null),
    interest_categories: parseInterestCategories(
      formData.get("interest_categories") as string | null
    ),
    required_documents: parseJsonTextArray(
      formData.get("required_documents") as string | null
    ),
    document_files: parseDocumentFiles(formData.get("document_files") as string | null),
    apply_method: ((formData.get("apply_method") as string) || "").trim(),
    apply_url: ((formData.get("apply_url") as string) || "").trim(),
    homepage_url: ((formData.get("homepage_url") as string) || "").trim() || null,
    contact: ((formData.get("contact") as string) || "").trim() || null,
    note: ((formData.get("note") as string) || "").trim() || null,
    selection_note: ((formData.get("selection_note") as string) || "").trim() || null,
    poster_image_url: ((formData.get("poster_image_url") as string) || "").trim() || null,
    original_notice_image_url:
      ((formData.get("original_notice_image_url") as string) || "").trim() || null,
    original_notice_image_urls: parseJsonTextArray(
      formData.get("original_notice_image_urls") as string | null
    ),
    original_notice_text:
      ((formData.get("original_notice_text") as string) || "").trim() || null,
    source: ((formData.get("source") as string) || "").trim() || null,
    external_id: ((formData.get("external_id") as string) || "").trim() || null,
    source_url: ((formData.get("source_url") as string) || "").trim() || null,
    is_verified: bool("is_verified"),
    list_on_home: bool("list_on_home"),
    is_recommended: bool("is_recommended"),
    recommended_sort_order: parseOptionalInt(
      formData.get("recommended_sort_order") as string | null
    ),
    collected_at: ((formData.get("collected_at") as string) || "").trim() || null,
  };
}

export function buildContestSelectionStagesPayload(
  formData: FormData,
  contestId: number
): ContestSelectionStageInsert[] {
  const raw = (formData.get("selection_stages_json") as string | null) ?? "";
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ContestSelectionStageInsert[] = [];
    parsed.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const row = item as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title.trim() : "";
      if (!title) return;
      const phase: SelectionStagePhase =
        row.phase === "post_acceptance" ? "post_acceptance" : "selection";
      out.push({
        contest_id: contestId,
        stage_order: index + 1,
        title,
        phase,
        schedule_date:
          typeof row.schedule_date === "string" && row.schedule_date.trim()
            ? row.schedule_date.trim()
            : null,
        schedule_text:
          typeof row.schedule_text === "string" && row.schedule_text.trim()
            ? row.schedule_text.trim()
            : null,
        note: typeof row.note === "string" && row.note.trim() ? row.note.trim() : null,
      });
    });
    return out;
  } catch {
    return [];
  }
}

export { getAdminReturnPath };
