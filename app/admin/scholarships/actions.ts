"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type ScholarshipInsert =
  Database["public"]["Tables"]["scholarships"]["Insert"];

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

  const { error } = await supabase.from("scholarships").insert(payload);
  if (error) return { error: error.message };

  revalidatePath("/admin/scholarships");
  redirect("/admin/scholarships");
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

  const { error } = await supabase
    .from("scholarships")
    .update(payload)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/scholarships");
  redirect("/admin/scholarships");
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
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// FormData → DB payload 변환 헬퍼
// ─────────────────────────────────────────────────────────────────
function parseOptionalFloat(val: string | null): number | null {
  if (!val || val.trim() === "") return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parseOptionalInt(val: string | null): number | null {
  if (!val || val.trim() === "") return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function parseTextArray(val: string | null): string[] {
  if (!val || val.trim() === "") return [];
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildPayload(formData: FormData): ScholarshipInsert {
  const g = (key: string) => formData.get(key) as string | null;

  return {
    name: g("name") ?? "",
    organization: g("organization") ?? "",
    institution_type: g("institution_type") as ScholarshipInsert["institution_type"],
    support_types: parseTextArray(g("support_types")) as ScholarshipInsert["support_types"],
    support_amount: parseOptionalFloat(g("support_amount")) ?? 0,
    apply_start_date: g("apply_start_date") ?? "",
    apply_end_date: g("apply_end_date") ?? "",
    announcement_date: g("announcement_date") || null,
    selection_count: parseOptionalInt(g("selection_count")),
    // 자격 요건
    qual_school_location: parseTextArray(g("qual_school_location")) as ScholarshipInsert["qual_school_location"] || null,
    qual_school_category: parseTextArray(g("qual_school_category")) as ScholarshipInsert["qual_school_category"] || null,
    qual_academic_year: g("qual_academic_year")
      ? parseTextArray(g("qual_academic_year")).map(Number).filter((n) => !isNaN(n))
      : null,
    qual_enrollment_status: parseTextArray(g("qual_enrollment_status")) as ScholarshipInsert["qual_enrollment_status"] || null,
    qual_major: parseTextArray(g("qual_major")) || null,
    qual_gpa_min: parseOptionalFloat(g("qual_gpa_min")),
    qual_gpa_last_semester_min: parseOptionalFloat(g("qual_gpa_last_semester_min")),
    qual_income_level_min: parseOptionalInt(g("qual_income_level_min")),
    qual_income_level_max: parseOptionalInt(g("qual_income_level_max")),
    qual_household_size_max: parseOptionalInt(g("qual_household_size_max")),
    qual_gender: (g("qual_gender") || null) as ScholarshipInsert["qual_gender"],
    qual_age_min: parseOptionalInt(g("qual_age_min")),
    qual_age_max: parseOptionalInt(g("qual_age_max")),
    qual_region: parseTextArray(g("qual_region")) || null,
    qual_nationality: (g("qual_nationality") || null) as ScholarshipInsert["qual_nationality"],
    qual_special_info: parseTextArray(g("qual_special_info")) as ScholarshipInsert["qual_special_info"] || null,
    qual_parent_occupation: parseTextArray(g("qual_parent_occupation")) as ScholarshipInsert["qual_parent_occupation"] || null,
    qual_military_status: (g("qual_military_status") || null) as ScholarshipInsert["qual_military_status"],
    can_overlap: g("can_overlap") === "true",
    required_documents: parseTextArray(g("required_documents")),
    apply_method: g("apply_method") ?? "",
    apply_url: g("apply_url") ?? "",
    homepage_url: g("homepage_url") || null,
    contact: g("contact") || null,
    note: g("note") || null,
    selection_stages: parseOptionalInt(g("selection_stages")) ?? 1,
    selection_stage_1: g("selection_stage_1") ?? "",
    selection_stage_2: g("selection_stage_2") || null,
    selection_stage_3: g("selection_stage_3") || null,
    selection_stage_4: g("selection_stage_4") || null,
    selection_stage_5: g("selection_stage_5") || null,
    selection_note: g("selection_note") || null,
    selection_stage_1_schedule: g("selection_stage_1_schedule") || null,
    selection_stage_2_schedule: g("selection_stage_2_schedule") || null,
    selection_stage_3_schedule: g("selection_stage_3_schedule") || null,
    selection_stage_4_schedule: g("selection_stage_4_schedule") || null,
    selection_stage_5_schedule: g("selection_stage_5_schedule") || null,
    poster_image_url: g("poster_image_url") || null,
    collected_at: new Date().toISOString(),
    is_verified: g("is_verified") === "true",
  };
}
