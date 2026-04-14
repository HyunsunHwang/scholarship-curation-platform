"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function toggleBookmark(
  scholarshipId: number
): Promise<{ bookmarked: boolean } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  const { data: existing, error: selectError } = await supabase
    .from("bookmarks")
    .select("id")
    .eq("user_id", user.id)
    .eq("scholarship_id", scholarshipId)
    .maybeSingle();

  if (selectError) {
    console.error("[toggleBookmark] select error:", selectError.message);
    return { error: selectError.message };
  }

  if (existing) {
    const { error: deleteError } = await supabase
      .from("bookmarks")
      .delete()
      .eq("id", existing.id);
    if (deleteError) {
      console.error("[toggleBookmark] delete error:", deleteError.message);
      return { error: deleteError.message };
    }
    revalidatePath("/");
    revalidatePath("/mypage");
    return { bookmarked: false };
  } else {
    const { error: insertError } = await supabase
      .from("bookmarks")
      .insert({ user_id: user.id, scholarship_id: scholarshipId });
    if (insertError) {
      console.error("[toggleBookmark] insert error:", insertError.message);
      return { error: insertError.message };
    }
    revalidatePath("/");
    revalidatePath("/mypage");
    return { bookmarked: true };
  }
}
