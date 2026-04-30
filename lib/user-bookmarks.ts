import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getBookmarkedScholarshipIds(
  supabase: SupabaseServerClient,
  userId: string
) {
  const { data: bookmarkRows } = await supabase
    .from("bookmarks")
    .select("scholarship_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (bookmarkRows ?? []).map((row) => row.scholarship_id as number);
}
