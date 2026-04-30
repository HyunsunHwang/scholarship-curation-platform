"use server";

import { createClient } from "@/lib/supabase/server";

export async function incrementScholarshipViewCount(scholarshipId: number) {
  if (!Number.isFinite(scholarshipId) || scholarshipId <= 0) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("scholarships")
    .select("view_count")
    .eq("id", scholarshipId)
    .maybeSingle();
  if (!data) return;
  const nextViewCount = (data.view_count ?? 0) + 1;
  await supabase
    .from("scholarships")
    .update({ view_count: nextViewCount })
    .eq("id", scholarshipId);
}
