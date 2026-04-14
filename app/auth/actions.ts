"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type AuthState = {
  type: "error" | "success";
  message: string;
} | null;

export async function login(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { type: "error", message: "이메일과 비밀번호를 입력해주세요." };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message === "Invalid login credentials") {
      return { type: "error", message: "이메일 또는 비밀번호가 올바르지 않습니다." };
    }
    if (error.message === "Email not confirmed") {
      return { type: "error", message: "이메일 인증이 완료되지 않았습니다. 받은 메일함을 확인해주세요." };
    }
    return { type: "error", message: error.message };
  }

  redirect("/");
}

export async function signup(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!email || !password || !confirmPassword) {
    return { type: "error", message: "모든 항목을 입력해주세요." };
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

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (error.message.includes("already registered")) {
      return { type: "error", message: "이미 가입된 이메일입니다. 로그인해주세요." };
    }
    return { type: "error", message: error.message };
  }

  // 이메일 인증이 필요한 경우 (session이 없음)
  if (data.user && !data.session) {
    return {
      type: "success",
      message: `${email}로 인증 메일을 보냈습니다. 메일함을 확인하고 링크를 클릭해주세요.`,
    };
  }

  // 이메일 인증 없이 바로 가입 완료된 경우
  redirect("/onboarding");
}

export async function logout(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
