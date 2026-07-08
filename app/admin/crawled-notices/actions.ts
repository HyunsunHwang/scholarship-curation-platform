"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildScholarshipPayload, buildSelectionStagesPayload } from "@/lib/scholarship-payload";
import {
  extractScholarshipDraft,
  type NoticeDraft,
} from "@/lib/notice-extraction";

function normalizeRejectTag(reviewNote?: string) {
  const note = (reviewNote ?? "").trim();
  if (!note) return { taggedNote: null };
  const hasTag = /^\[[a-z0-9_]+\]/i.test(note);
  if (hasTag) return { taggedNote: note };

  let tag = "other";
  if (/중복|duplicate/i.test(note)) tag = "duplicate";
  else if (/장학\s*아님|not\s*scholarship/i.test(note)) tag = "not_scholarship";
  else if (/기간\s*종료|마감|expired|closed/i.test(note)) tag = "expired";
  else if (/조건\s*불명확|정보\s*부족|insufficient/i.test(note)) tag = "insufficient_info";

  return { taggedNote: `[${tag}] ${note}` };
}

async function ensureAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: "로그인이 필요합니다." };

  const isAdmin = await supabase.rpc("is_admin");
  if (!isAdmin.data)
    return { supabase, user, error: "관리자 권한이 필요합니다." };

  return { supabase, user, error: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function mergeDraftKeepingExisting(
  existing: unknown,
  generated: NoticeDraft
): NoticeDraft {
  if (!isRecord(existing)) return generated;
  const merged: Record<string, unknown> = { ...generated };
  for (const [key, existingValue] of Object.entries(existing)) {
    const generatedValue = merged[key];
    if (isMeaningfulValue(existingValue)) {
      merged[key] = existingValue;
      continue;
    }
    if (Array.isArray(generatedValue) && generatedValue.length > 0) continue;
    if (typeof generatedValue === "string" && generatedValue.trim()) continue;
    if (generatedValue !== null && generatedValue !== undefined) continue;
    merged[key] = existingValue;
  }
  return merged as NoticeDraft;
}

// ─────────────────────────────────────────────────────────────────
// 수집 공지 → scholarships 승격 (검수 폼 제출)
// ─────────────────────────────────────────────────────────────────
export async function promoteNotice(noticeId: number, formData: FormData) {
  const { supabase, user, error: authError } = await ensureAdmin();
  if (authError) return { error: authError };

  const payload = buildScholarshipPayload(formData);

  const { data: inserted, error } = await supabase
    .from("scholarships")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { error: error.message };

  const posterUrl = (formData.get("poster_image_url") as string) || null;
  if (posterUrl && inserted?.id) {
    await supabase
      .from("scholarships")
      .update({ poster_image_url: posterUrl })
      .eq("id", inserted.id);
  }

  if (inserted?.id) {
    const stages = buildSelectionStagesPayload(formData, inserted.id);
    if (stages.length > 0) {
      const { error: stagesError } = await supabase
        .from("scholarship_selection_stages")
        .insert(stages);
      if (stagesError) return { error: `선발 단계 저장 실패: ${stagesError.message}` };
    }
  }

  const { error: markError } = await supabase
    .from("crawled_notices")
    .update({
      status: "promoted",
      scholarship_id: inserted?.id ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
    })
    .eq("id", noticeId);
  if (markError) return { error: markError.message };

  revalidatePath("/admin/crawled-notices");
  revalidatePath("/admin/scholarships");
  revalidatePath("/");
  revalidatePath("/matched");
  redirect("/admin/crawled-notices");
}

// ─────────────────────────────────────────────────────────────────
// 수집 공지 본문 → LLM 구조화 초안 생성
// ─────────────────────────────────────────────────────────────────
export async function generateNoticeDraft(
  noticeId: number
): Promise<{ error?: string; success?: true }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError) return { error: authError };

  const { data: notice, error } = await supabase
    .from("crawled_notices")
    .select("id, title, source_name, source_group, notice_url, body, extracted_draft")
    .eq("id", noticeId)
    .single();
  if (error) return { error: error.message };
  if (!notice) return { error: "공지 데이터를 찾을 수 없습니다." };

  const { draft, error: extractError, resolvedBody } = await extractScholarshipDraft({
    title: notice.title,
    sourceName: notice.source_name,
    body: notice.body ?? "",
    noticeUrl: notice.notice_url ?? undefined,
  });
  if (extractError || !draft) {
    return { error: extractError ?? "LLM 초안 생성에 실패했습니다." };
  }

  // 교외(더드림)처럼 이미 구조화 초안이 있는 소스는 기존 값 손실을 막기 위해
  // 빈 칸만 LLM 결과로 보완합니다.
  const nextDraft =
    notice.source_group === "thedream"
      ? mergeDraftKeepingExisting(notice.extracted_draft, draft)
      : draft;

  const { error: updateError } = await supabase
    .from("crawled_notices")
    .update({
      extracted_draft: nextDraft,
      body:
        !notice.body && resolvedBody && resolvedBody.trim().length >= 120
          ? resolvedBody
          : notice.body,
    })
    .eq("id", noticeId);
  if (updateError) return { error: updateError.message };

  revalidatePath(`/admin/crawled-notices/${noticeId}`);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// 수집 공지 거절 (장학금 아님 / 중복 등)
// ─────────────────────────────────────────────────────────────────
export async function rejectNotice(
  noticeId: number,
  reviewNote?: string
): Promise<{ error?: string; success?: true }> {
  const { supabase, user, error: authError } = await ensureAdmin();
  if (authError) return { error: authError };

  const { error } = await supabase
    .from("crawled_notices")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
      review_note: normalizeRejectTag(reviewNote).taggedNote,
    })
    .eq("id", noticeId);
  if (error) return { error: error.message };

  revalidatePath("/admin/crawled-notices");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// 거절/승격 취소 → 다시 검수 대기(new)로
// ─────────────────────────────────────────────────────────────────
export async function restoreNotice(
  noticeId: number
): Promise<{ error?: string; success?: true }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError) return { error: authError };

  const { error } = await supabase
    .from("crawled_notices")
    .update({
      status: "new",
      reviewed_at: null,
      reviewed_by: null,
      review_note: null,
      scholarship_id: null,
    })
    .eq("id", noticeId);
  if (error) return { error: error.message };

  revalidatePath("/admin/crawled-notices");
  return { success: true };
}
