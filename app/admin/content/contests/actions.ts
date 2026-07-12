"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildContestPayload,
  buildContestSelectionStagesPayload,
  getAdminReturnPath,
} from "@/lib/contest-payload";

/**
 * contest_selection_stages 동기화 (전체 교체).
 */
async function syncContestSelectionStages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contestId: number,
  formData: FormData
): Promise<{ error?: string }> {
  const { error: deleteError } = await supabase
    .from("contest_selection_stages")
    .delete()
    .eq("contest_id", contestId);
  if (deleteError) return { error: deleteError.message };

  const stages = buildContestSelectionStagesPayload(formData, contestId);
  if (stages.length === 0) return {};

  const { error: insertError } = await supabase
    .from("contest_selection_stages")
    .insert(stages);
  if (insertError) return { error: insertError.message };
  return {};
}

function revalidateContestPaths() {
  revalidatePath("/admin/content");
  revalidatePath("/");
}

// ─────────────────────────────────────────────────────────────────
// 공모전/교육/활동 생성
// ─────────────────────────────────────────────────────────────────
export async function createContest(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const isAdmin = await supabase.rpc("is_admin");
  if (!isAdmin.data) return { error: "관리자 권한이 필요합니다." };

  const payload = buildContestPayload(formData);
  const returnPath = getAdminReturnPath(
    formData,
    `/admin/content?kind=${payload.content_kind ?? "contest"}`
  );

  const { data: inserted, error } = await supabase
    .from("contests")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { error: error.message };

  if (inserted?.id) {
    const stagesResult = await syncContestSelectionStages(supabase, inserted.id, formData);
    if (stagesResult.error) return { error: `선발 단계 저장 실패: ${stagesResult.error}` };
  }

  revalidateContestPaths();
  redirect(returnPath);
}

// ─────────────────────────────────────────────────────────────────
// 공모전/교육/활동 수정
// ─────────────────────────────────────────────────────────────────
export async function updateContest(id: number, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const isAdmin = await supabase.rpc("is_admin");
  if (!isAdmin.data) return { error: "관리자 권한이 필요합니다." };

  const payload = buildContestPayload(formData);
  const returnPath = getAdminReturnPath(
    formData,
    `/admin/content?kind=${payload.content_kind ?? "contest"}`
  );

  const { error } = await supabase.from("contests").update(payload).eq("id", id);
  if (error) return { error: error.message };

  const stagesResult = await syncContestSelectionStages(supabase, id, formData);
  if (stagesResult.error) return { error: `선발 단계 저장 실패: ${stagesResult.error}` };

  revalidateContestPaths();
  revalidatePath(`/contests/${id}`);
  revalidatePath(returnPath.split("?")[0]);
  redirect(returnPath);
}

// ─────────────────────────────────────────────────────────────────
// 공모전/교육/활동 삭제
// ─────────────────────────────────────────────────────────────────
export async function deleteContest(id: number) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const isAdmin = await supabase.rpc("is_admin");
  if (!isAdmin.data) return { error: "관리자 권한이 필요합니다." };

  const { error } = await supabase.from("contests").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidateContestPaths();
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// 검증 상태 토글 (is_verified)
// ─────────────────────────────────────────────────────────────────
export async function toggleContestVerified(id: number, current: boolean) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const isAdmin = await supabase.rpc("is_admin");
  if (!isAdmin.data) return { error: "관리자 권한이 필요합니다." };

  const { error } = await supabase
    .from("contests")
    .update({ is_verified: !current })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateContestPaths();
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// 추천(홈 상단 노출) 토글
// ─────────────────────────────────────────────────────────────────
export async function toggleContestRecommended(id: number, current: boolean) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const isAdmin = await supabase.rpc("is_admin");
  if (!isAdmin.data) return { error: "관리자 권한이 필요합니다." };

  const { error } = await supabase
    .from("contests")
    .update({ is_recommended: !current })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateContestPaths();
  return { success: true };
}
