"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildScholarshipPayload as buildPayload,
  getAdminReturnPath,
  parseTargetOrgUnitIds,
} from "@/lib/scholarship-payload";

/**
 * 교내 장학금 org_unit 타겟 동기화 (전체 교체).
 * 교외 장학금이거나 타겟이 비어 있으면 기존 행만 제거한다.
 */
async function syncTargetOrgUnits(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scholarshipId: number,
  orgUnitIds: number[]
): Promise<{ error?: string }> {
  const { error: deleteError } = await supabase
    .from("scholarship_target_units")
    .delete()
    .eq("scholarship_id", scholarshipId);
  if (deleteError) return { error: deleteError.message };

  if (orgUnitIds.length === 0) return {};

  const { error: insertError } = await supabase
    .from("scholarship_target_units")
    .insert(orgUnitIds.map((orgUnitId) => ({
      scholarship_id: scholarshipId,
      org_unit_id: orgUnitId,
    })));
  if (insertError) return { error: insertError.message };
  return {};
}

// ─────────────────────────────────────────────────────────────────
// 장학금 생성
// ─────────────────────────────────────────────────────────────────
export async function createScholarship(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const isAdmin = await supabase.rpc("is_admin");
  if (!isAdmin.data) return { error: "관리자 권한이 필요합니다." };

  const payload = buildPayload(formData);
  const returnPath = getAdminReturnPath(formData, "/admin/scholarships");

  const { data: inserted, error } = await supabase
    .from("scholarships")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { error: error.message };

  if (inserted?.id) {
    const targetIds = payload.scholarship_type === "on_campus" ? parseTargetOrgUnitIds(formData) : [];
    const syncResult = await syncTargetOrgUnits(supabase, inserted.id, targetIds);
    if (syncResult.error) return { error: `대상 조직 저장 실패: ${syncResult.error}` };
  }

  // poster_image_url은 컬럼이 없을 수 있으므로 별도 처리 (실패해도 진행)
  const posterUrl = (formData.get("poster_image_url") as string) || null;
  if (posterUrl && inserted?.id) {
    await supabase
      .from("scholarships")
      .update({ poster_image_url: posterUrl })
      .eq("id", inserted.id);
  }

  revalidatePath("/admin/scholarships");
  revalidatePath("/admin/ads");
  revalidatePath("/");
  revalidatePath("/matched");
  redirect(returnPath);
}

// ─────────────────────────────────────────────────────────────────
// 장학금 수정
// ─────────────────────────────────────────────────────────────────
export async function updateScholarship(id: number, formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const isAdmin = await supabase.rpc("is_admin");
  if (!isAdmin.data) return { error: "관리자 권한이 필요합니다." };

  const payload = buildPayload(formData);
  const returnPath = getAdminReturnPath(formData, "/admin/scholarships");

  const { error } = await supabase
    .from("scholarships")
    .update(payload)
    .eq("id", id);

  if (error) return { error: error.message };

  {
    const targetIds = payload.scholarship_type === "on_campus" ? parseTargetOrgUnitIds(formData) : [];
    const syncResult = await syncTargetOrgUnits(supabase, id, targetIds);
    if (syncResult.error) return { error: `대상 조직 저장 실패: ${syncResult.error}` };
  }

  // poster_image_url은 컬럼이 없을 수 있으므로 별도 처리 (실패해도 진행)
  const posterUrl = (formData.get("poster_image_url") as string) || null;
  if (posterUrl !== undefined) {
    await supabase
      .from("scholarships")
      .update({ poster_image_url: posterUrl })
      .eq("id", id);
  }

  revalidatePath("/admin/scholarships");
  revalidatePath("/admin/ads");
  revalidatePath("/");
  revalidatePath("/matched");
  revalidatePath(`/scholarships/${id}`);
  revalidatePath(returnPath.split("?")[0]);
  redirect(returnPath);
}

// ─────────────────────────────────────────────────────────────────
// 장학금 삭제
// ─────────────────────────────────────────────────────────────────
export async function deleteScholarship(id: number) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const isAdmin = await supabase.rpc("is_admin");
  if (!isAdmin.data) return { error: "관리자 권한이 필요합니다." };

  const { error } = await supabase
    .from("scholarships")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/scholarships");
  revalidatePath("/");
  revalidatePath("/matched");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// 검증 상태 토글 (is_verified)
// ─────────────────────────────────────────────────────────────────
export async function toggleVerified(id: number, current: boolean) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const isAdmin = await supabase.rpc("is_admin");
  if (!isAdmin.data) return { error: "관리자 권한이 필요합니다." };

  const { error } = await supabase
    .from("scholarships")
    .update({ is_verified: !current })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/scholarships");
  revalidatePath("/");
  revalidatePath("/matched");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// 추천(홈 상단 노출) 토글
// ─────────────────────────────────────────────────────────────────
export async function toggleRecommended(id: number, current: boolean) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const isAdmin = await supabase.rpc("is_admin");
  if (!isAdmin.data) return { error: "관리자 권한이 필요합니다." };

  const { error } = await supabase
    .from("scholarships")
    .update({ is_recommended: !current })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/scholarships");
  revalidatePath("/");
  revalidatePath("/matched");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// 목록에서 포스터 이미지 URL만 빠르게 수정
// ─────────────────────────────────────────────────────────────────
export async function updatePosterImageUrl(
  id: number,
  posterImageUrl: string | null
): Promise<{ error?: string; success?: true }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const isAdmin = await supabase.rpc("is_admin");
  if (!isAdmin.data) return { error: "관리자 권한이 필요합니다." };

  const parsed = parsePosterUrl(posterImageUrl);
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await supabase
    .from("scholarships")
    .update({ poster_image_url: parsed.value })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/scholarships");
  revalidatePath(`/scholarships/${id}`);
  return { success: true };
}

function parsePosterUrl(
  raw: string | null
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw.trim() === "") return { ok: true, value: null };
  const t = raw.trim();
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { ok: false, error: "http 또는 https URL만 입력할 수 있습니다." };
    }
    return { ok: true, value: u.href };
  } catch {
    return { ok: false, error: "올바른 URL 형식이 아닙니다." };
  }
}

