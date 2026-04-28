import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** 관리자가 아니면 홈 또는 로그인으로 보냅니다. */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/");
  }
}
