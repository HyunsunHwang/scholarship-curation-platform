"use server";

import { createClient } from "@/lib/supabase/server";
import type { OrganizationKindType } from "@/lib/database.types";

export type PartnerSignupState = {
  type: "error" | "success";
  message: string;
} | null;

const allowedKinds: OrganizationKindType[] = ["학과", "학교", "재단", "기타"];

export async function requestPartnerAccess(
  _prevState: PartnerSignupState,
  formData: FormData
): Promise<PartnerSignupState> {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const applicantName = String(formData.get("applicant_name") ?? "").trim();
  const organizationKind = String(formData.get("organization_kind") ?? "").trim() as OrganizationKindType;
  const organizationName = String(formData.get("organization_name") ?? "").trim();
  const requestNote = String(formData.get("request_note") ?? "").trim();

  if (!email || !password || !confirmPassword || !applicantName || !organizationKind || !organizationName) {
    return { type: "error", message: "필수 항목을 모두 입력해주세요." };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { type: "error", message: "올바른 이메일 형식이 아닙니다." };
  }

  if (password.length < 8) {
    return { type: "error", message: "비밀번호는 8자 이상이어야 합니다." };
  }

  if (password !== confirmPassword) {
    return { type: "error", message: "비밀번호가 일치하지 않습니다." };
  }

  if (!allowedKinds.includes(organizationKind)) {
    return { type: "error", message: "기관 유형을 다시 선택해주세요." };
  }

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpError) {
    if (signUpError.message.includes("already registered")) {
      return {
        type: "error",
        message: "이미 가입된 이메일입니다. 관리자에게 권한 요청 상태를 확인해주세요.",
      };
    }
    return { type: "error", message: signUpError.message };
  }

  const { error: requestError } = await supabase.from("org_signup_requests").insert({
    user_id: authData.user?.id ?? null,
    email,
    applicant_name: applicantName,
    organization_kind: organizationKind,
    organization_name: organizationName,
    request_note: requestNote || null,
    status: "pending",
  });

  if (requestError && requestError.code !== "23505") {
    return {
      type: "error",
      message: "회원가입은 완료되었지만 권한 요청 저장에 실패했습니다. 관리자에게 직접 전달해주세요.",
    };
  }

  return {
    type: "success",
    message:
      "가입 및 권한 요청이 접수되었습니다. 관리자가 승인하면 기관 담당자 권한이 활성화됩니다.",
  };
}
