"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildContestPayload,
  buildContestSelectionStagesPayload,
  parseContestContentKind,
} from "@/lib/contest-payload";
import { formatOriginalNoticeText } from "@/lib/notice-extraction";
import type { ContestContentKind } from "@/lib/admin-kinds";

function normalizeRejectTag(reviewNote?: string) {
  const note = (reviewNote ?? "").trim();
  if (!note) return { taggedNote: null };
  const hasTag = /^\[[a-z0-9_]+\]/i.test(note);
  if (hasTag) return { taggedNote: note };

  let tag = "other";
  if (/중복|duplicate/i.test(note)) tag = "duplicate";
  else if (/아님|not_/i.test(note)) tag = "not_relevant";
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

export async function promoteCrawledContest(
  crawledId: number,
  lockedKind: ContestContentKind,
  formData: FormData
) {
  const { supabase, user, error: authError } = await ensureAdmin();
  if (authError) return { error: authError };

  const payload = buildContestPayload(formData, lockedKind);

  const { data: inserted, error } = await supabase
    .from("contests")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { error: error.message };

  if (inserted?.id) {
    const stages = buildContestSelectionStagesPayload(formData, inserted.id);
    if (stages.length > 0) {
      const { error: stagesError } = await supabase
        .from("contest_selection_stages")
        .insert(stages);
      if (stagesError) return { error: `선발 단계 저장 실패: ${stagesError.message}` };
    }
  }

  const { error: markError } = await supabase
    .from("crawled_contests")
    .update({
      status: "promoted",
      contest_id: inserted?.id ?? null,
      content_kind: lockedKind,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
    })
    .eq("id", crawledId);
  if (markError) return { error: markError.message };

  revalidatePath("/admin/review");
  revalidatePath("/admin/content");
  revalidatePath("/");
  redirect(`/admin/review?kind=${lockedKind}`);
}

export async function formatCrawledContestBody(
  crawledId: number
): Promise<{ error?: string; success?: true }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError) return { error: authError };

  const { data: row, error } = await supabase
    .from("crawled_contests")
    .select("id, title, body")
    .eq("id", crawledId)
    .single();
  if (error) return { error: error.message };
  if (!row) return { error: "수집 데이터를 찾을 수 없습니다." };

  const body = row.body?.trim() ?? "";
  if (!body) return { error: "정리할 본문이 없습니다." };

  const { text: formatted, error: formatError } = await formatOriginalNoticeText({
    title: row.title,
    body,
  });
  if (formatError && !formatted.trim()) {
    return { error: formatError };
  }

  const { error: updateError } = await supabase
    .from("crawled_contests")
    .update({ body: formatted.trim() || body })
    .eq("id", crawledId);
  if (updateError) return { error: updateError.message };

  revalidatePath(`/admin/review/contests/${crawledId}`);
  return { success: true };
}

export async function rejectCrawledContest(
  crawledId: number,
  reviewNote?: string
): Promise<{ error?: string; success?: true }> {
  const { supabase, user, error: authError } = await ensureAdmin();
  if (authError) return { error: authError };

  const { data: row } = await supabase
    .from("crawled_contests")
    .select("content_kind")
    .eq("id", crawledId)
    .single();

  const { error } = await supabase
    .from("crawled_contests")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
      review_note: normalizeRejectTag(reviewNote).taggedNote,
    })
    .eq("id", crawledId);
  if (error) return { error: error.message };

  const kind = parseContestContentKind(row?.content_kind ?? null);
  revalidatePath("/admin/review");
  revalidatePath(`/admin/review?kind=${kind}`);
  return { success: true };
}

export async function restoreCrawledContest(
  crawledId: number
): Promise<{ error?: string; success?: true }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError) return { error: authError };

  const { data: row } = await supabase
    .from("crawled_contests")
    .select("content_kind")
    .eq("id", crawledId)
    .single();

  const { error } = await supabase
    .from("crawled_contests")
    .update({
      status: "new",
      reviewed_at: null,
      reviewed_by: null,
      review_note: null,
      contest_id: null,
    })
    .eq("id", crawledId);
  if (error) return { error: error.message };

  const kind = parseContestContentKind(row?.content_kind ?? null);
  revalidatePath("/admin/review");
  revalidatePath(`/admin/review?kind=${kind}`);
  return { success: true };
}
