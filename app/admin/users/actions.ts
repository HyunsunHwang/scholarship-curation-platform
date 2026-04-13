"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function grantAdmin(targetUserId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { error } = await supabase.rpc("grant_admin", {
    target_user_id: targetUserId,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { success: true };
}

export async function revokeAdmin(targetUserId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { error } = await supabase.rpc("revoke_admin", {
    target_user_id: targetUserId,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { success: true };
}
