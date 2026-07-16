"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildScholarshipPayload, buildSelectionStagesPayload } from "@/lib/scholarship-payload";
import {
  extractScholarshipDraft,
  formatOriginalNoticeText,
  type NoticeDraft,
} from "@/lib/notice-extraction";
import { applyPostPhaseLReviewDecision } from "@/lib/post-phase-l/review-actions";
import { isPostPhaseLEnvironment } from "@/lib/post-phase-l/runtime";

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

  const { data: reviewRow, error: reviewRowError } = await supabase
    .from("crawled_notices")
    .select("status, scholarship_id")
    .eq("id", noticeId)
    .single();
  if (reviewRowError) return { error: reviewRowError.message };
  if (reviewRow.status !== "new" || reviewRow.scholarship_id) {
    return { error: "이미 처리된 공고는 다시 장학금으로 등록할 수 없습니다." };
  }

  const payload = buildScholarshipPayload(formData);
  const lEnvironment = isPostPhaseLEnvironment();
  if (lEnvironment) {
    payload.is_verified = false;
    payload.list_on_home = false;
  }

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

  if (!inserted?.id) return { error: "장학금 레코드 ID를 확인할 수 없습니다." };

  const lDecision = await applyPostPhaseLReviewDecision({
    supabase,
    noticeId,
    decision: "approve",
    reason:
      String(formData.get("review_note") ?? "").trim() ||
      "Approved through the existing admin review form.",
    scholarshipId: inserted.id,
  });
  if (lDecision.handled) {
    if (lDecision.error) {
      await supabase.from("scholarships").delete().eq("id", inserted.id);
      return { error: `Append-only review event 저장 실패: ${lDecision.error}` };
    }
  } else {

    const { error: markError } = await supabase
      .from("crawled_notices")
      .update({
        status: "promoted",
        scholarship_id: inserted.id,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id ?? null,
      })
      .eq("id", noticeId);
    if (markError) return { error: markError.message };
  }

  revalidatePath("/admin/crawled-notices");
  revalidatePath("/admin/review");
  revalidatePath("/admin/scholarships");
  revalidatePath("/admin/content");
  revalidatePath("/");
  revalidatePath("/matched");
  redirect("/admin/review?kind=scholarship");
}

// ─────────────────────────────────────────────────────────────────
// 수집 공지 본문 → LLM 구조화 초안 생성
// ─────────────────────────────────────────────────────────────────
export async function generateNoticeDraft(
  noticeId: number
): Promise<{ error?: string; success?: true }> {
  if (isPostPhaseLEnvironment()) {
    return { error: "Post-Phase L 환경에서는 외부 LLM 호출이 비활성화되어 있습니다." };
  }
  const { supabase, error: authError } = await ensureAdmin();
  if (authError) return { error: authError };

  const { data: notice, error } = await supabase
    .from("crawled_notices")
    .select("id, title, source_name, source_group, notice_url, body, image_urls, extracted_draft")
    .eq("id", noticeId)
    .single();
  if (error) return { error: error.message };
  if (!notice) return { error: "공지 데이터를 찾을 수 없습니다." };

  const existingImageUrls = Array.isArray(notice.image_urls)
    ? notice.image_urls.filter(
        (url): url is string => typeof url === "string" && url.trim().length > 0
      )
    : [];
  const {
    draft,
    error: extractError,
    resolvedBody,
    imageUrls: fetchedImageUrls,
  } = await extractScholarshipDraft({
    title: notice.title,
    sourceName: notice.source_name,
    body: notice.body ?? "",
    noticeUrl: notice.notice_url ?? undefined,
    sourceGroup: notice.source_group ?? undefined,
    forceFetchImages: existingImageUrls.length === 0,
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

  // 본문: URL에서 보강한 원문(또는 기존 body)을 형식 규칙에 맞게 정리
  const bodyForFormat =
    resolvedBody && resolvedBody.trim().length >= 120
      ? resolvedBody.trim()
      : (notice.body ?? "").trim();
  let nextBody = bodyForFormat || notice.body;
  if (bodyForFormat) {
    const { text: formatted } = await formatOriginalNoticeText({
      title: notice.title,
      body: bodyForFormat,
    });
    if (formatted.trim()) nextBody = formatted.trim();
  }

  const nextImageUrls =
    existingImageUrls.length > 0
      ? existingImageUrls
      : (fetchedImageUrls ?? []).filter(
          (url): url is string => typeof url === "string" && url.trim().length > 0
        );

  const { error: updateError } = await supabase
    .from("crawled_notices")
    .update({
      extracted_draft: nextDraft,
      body: nextBody,
      ...(nextImageUrls.length > 0 ? { image_urls: nextImageUrls } : {}),
    })
    .eq("id", noticeId);
  if (updateError) return { error: updateError.message };

  revalidatePath(`/admin/crawled-notices/${noticeId}`);
  revalidatePath(`/admin/review/scholarships/${noticeId}`);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// 수집 공지 본문만 원문 형식 규칙에 맞게 정리 (필드 초안은 건드리지 않음)
// ─────────────────────────────────────────────────────────────────
export async function formatNoticeBody(
  noticeId: number
): Promise<{ error?: string; success?: true }> {
  if (isPostPhaseLEnvironment()) {
    return { error: "Post-Phase L 환경에서는 외부 LLM 호출이 비활성화되어 있습니다." };
  }
  const { supabase, error: authError } = await ensureAdmin();
  if (authError) return { error: authError };

  const { data: notice, error } = await supabase
    .from("crawled_notices")
    .select("id, title, body")
    .eq("id", noticeId)
    .single();
  if (error) return { error: error.message };
  if (!notice) return { error: "공지 데이터를 찾을 수 없습니다." };

  const body = notice.body?.trim() ?? "";
  if (!body) return { error: "정리할 본문이 없습니다." };

  const { text: formatted, error: formatError } = await formatOriginalNoticeText({
    title: notice.title,
    body,
  });
  if (formatError && !formatted.trim()) {
    return { error: formatError };
  }

  const { error: updateError } = await supabase
    .from("crawled_notices")
    .update({ body: formatted.trim() || body })
    .eq("id", noticeId);
  if (updateError) return { error: updateError.message };

  revalidatePath(`/admin/crawled-notices/${noticeId}`);
  revalidatePath(`/admin/review/scholarships/${noticeId}`);
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

  const { data: reviewRow, error: reviewRowError } = await supabase
    .from("crawled_notices")
    .select("status, scholarship_id")
    .eq("id", noticeId)
    .single();
  if (reviewRowError) return { error: reviewRowError.message };
  if (reviewRow.status !== "new" || reviewRow.scholarship_id) {
    return { error: "검수 대기 중인 공고만 거절할 수 있습니다." };
  }

  const taggedNote = normalizeRejectTag(reviewNote).taggedNote;
  const lDecision = await applyPostPhaseLReviewDecision({
    supabase,
    noticeId,
    decision: "reject",
    reason: taggedNote,
  });
  if (lDecision.handled) {
    if (lDecision.error) return { error: lDecision.error };
    revalidatePath("/admin/crawled-notices");
    revalidatePath("/admin/review");
    return { success: true };
  }

  const { error } = await supabase
    .from("crawled_notices")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
      review_note: taggedNote,
    })
    .eq("id", noticeId);
  if (error) return { error: error.message };

  revalidatePath("/admin/crawled-notices");
  revalidatePath("/admin/review");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// 거절 취소 → 다시 검수 대기(new)로
// ─────────────────────────────────────────────────────────────────
export async function restoreNotice(
  noticeId: number
): Promise<{ error?: string; success?: true }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError) return { error: authError };

  const { data: reviewRow, error: reviewRowError } = await supabase
    .from("crawled_notices")
    .select("status, scholarship_id")
    .eq("id", noticeId)
    .single();
  if (reviewRowError) return { error: reviewRowError.message };
  if (reviewRow.status !== "rejected" || reviewRow.scholarship_id) {
    return { error: "거절된 공고만 검수 대기로 복원할 수 있습니다." };
  }

  const lDecision = await applyPostPhaseLReviewDecision({
    supabase,
    noticeId,
    decision: "reopen",
    reason: "Reopened through the existing admin review queue.",
  });
  if (lDecision.handled) {
    if (lDecision.error) return { error: lDecision.error };
    revalidatePath("/admin/crawled-notices");
    revalidatePath("/admin/review");
    return { success: true };
  }

  const { error } = await supabase
    .from("crawled_notices")
    .update({
      status: "new",
      reviewed_at: null,
      reviewed_by: null,
      review_note: null,
    })
    .eq("id", noticeId);
  if (error) return { error: error.message };

  revalidatePath("/admin/crawled-notices");
  revalidatePath("/admin/review");
  return { success: true };
}
