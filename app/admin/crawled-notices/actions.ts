"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildScholarshipPayload } from "@/lib/scholarship-payload";
import { extractScholarshipDraft } from "@/lib/notice-extraction";

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
    .select("id, title, source_name, body")
    .eq("id", noticeId)
    .single();
  if (error) return { error: error.message };
  if (!notice) return { error: "공지 데이터를 찾을 수 없습니다." };

  const { draft, error: extractError } = await extractScholarshipDraft({
    title: notice.title,
    sourceName: notice.source_name,
    body: notice.body ?? "",
  });
  if (extractError || !draft) {
    return { error: extractError ?? "LLM 초안 생성에 실패했습니다." };
  }

  const { error: updateError } = await supabase
    .from("crawled_notices")
    .update({ extracted_draft: draft })
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
