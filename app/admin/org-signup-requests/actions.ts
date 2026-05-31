"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { OrganizationKindType } from "@/lib/database.types";

async function ensureAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, error: "로그인이 필요합니다." };

  const isAdmin = await supabase.rpc("is_admin");
  if (!isAdmin.data) return { supabase, user: null, error: "관리자 권한이 필요합니다." };

  return { supabase, user, error: null };
}

export async function approveOrgSignupRequest(formData: FormData) {
  const ctx = await ensureAdmin();
  if (ctx.error || !ctx.user) return { error: ctx.error ?? "권한이 없습니다." };
  const { supabase, user } = ctx;

  const requestId = Number(formData.get("request_id"));
  if (!Number.isFinite(requestId)) return { error: "요청 식별자가 올바르지 않습니다." };

  const { data: request, error: fetchError } = await supabase
    .from("org_signup_requests")
    .select("id, status, user_id, email, organization_kind, organization_name")
    .eq("id", requestId)
    .single();

  if (fetchError || !request) return { error: "요청을 찾을 수 없습니다." };
  if (request.status !== "pending") return { error: "이미 처리된 요청입니다." };

  const profileUpdate = {
    is_org_manager: true,
    org_affiliation_kind: request.organization_kind as OrganizationKindType,
    org_affiliation_name: request.organization_name,
    org_approved_at: new Date().toISOString(),
  };

  const profileQuery = request.user_id
    ? supabase.from("profiles").update(profileUpdate).eq("id", request.user_id)
    : supabase.from("profiles").update(profileUpdate).eq("email", request.email);

  const { error: profileError } = await profileQuery;
  if (profileError) return { error: `프로필 권한 반영 실패: ${profileError.message}` };

  const { error: requestError } = await supabase
    .from("org_signup_requests")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      review_note: "관리자 승인",
    })
    .eq("id", request.id);

  if (requestError) return { error: requestError.message };

  revalidatePath("/admin/org-signup-requests");
  return { success: true };
}

export async function rejectOrgSignupRequest(formData: FormData) {
  const ctx = await ensureAdmin();
  if (ctx.error || !ctx.user) return { error: ctx.error ?? "권한이 없습니다." };
  const { supabase, user } = ctx;

  const requestId = Number(formData.get("request_id"));
  const reviewNote = String(formData.get("review_note") ?? "").trim();
  if (!Number.isFinite(requestId)) return { error: "요청 식별자가 올바르지 않습니다." };

  const { data: request, error: fetchError } = await supabase
    .from("org_signup_requests")
    .select("id, status")
    .eq("id", requestId)
    .single();

  if (fetchError || !request) return { error: "요청을 찾을 수 없습니다." };
  if (request.status !== "pending") return { error: "이미 처리된 요청입니다." };

  const { error } = await supabase
    .from("org_signup_requests")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      review_note: reviewNote || "관리자 반려",
    })
    .eq("id", request.id);

  if (error) return { error: error.message };

  revalidatePath("/admin/org-signup-requests");
  return { success: true };
}
