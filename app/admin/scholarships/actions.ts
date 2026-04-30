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

  const { data: inserted, error } = await supabase
    .from("scholarships")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { error: error.message };

  // poster_image_url은 컬럼이 없을 수 있으므로 별도 처리 (실패해도 진행)
  const posterUrl = (formData.get("poster_image_url") as string) || null;
  if (posterUrl && inserted?.id) {
    await supabase
      .from("scholarships")
      .update({ poster_image_url: posterUrl })
      .eq("id", inserted.id);
  }

  revalidatePath("/admin/scholarships");
  revalidatePath("/");
  revalidatePath("/matched");
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

  // poster_image_url은 컬럼이 없을 수 있으므로 별도 처리 (실패해도 진행)
  const posterUrl = (formData.get("poster_image_url") as string) || null;
  if (posterUrl !== undefined) {
    await supabase
      .from("scholarships")
      .update({ poster_image_url: posterUrl })
      .eq("id", id);
  }

  revalidatePath("/admin/scholarships");
  revalidatePath("/");
  revalidatePath("/matched");
  revalidatePath(`/scholarships/${id}`);
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

function parseJsonTextArray(val: string | null): string[] {
  if (!val || val.trim() === "") return [];
  try {
    const parsed = JSON.parse(val);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  } catch {
    return [];
  }
}

function buildPayload(formData: FormData): ScholarshipInsert {
  const g = (key: string) => formData.get(key) as string | null;
  // hidden+checkbox 패턴은 formData.get()이 hidden(false)을 먼저 반환하므로
  // getAll()로 "true"가 포함됐는지 확인해야 함
  const bool = (key: string) => formData.getAll(key).includes("true");
  const originalNoticeImageUrls = parseJsonTextArray(g("original_notice_image_urls"));

  return {
    name: g("name") ?? "",
    organization: g("organization") ?? "",
    institution_type: g("institution_type") as ScholarshipInsert["institution_type"],
    support_types: parseTextArray(g("support_types")) as ScholarshipInsert["support_types"],
    support_amount: parseOptionalFloat(g("support_amount")) ?? 0,
    support_amount_text: g("support_amount_text") || null,
    apply_start_date: g("apply_start_date") ?? "",
    apply_end_date: g("apply_end_date") ?? "",
    announcement_date: g("announcement_date") || null,
    selection_count: parseOptionalInt(g("selection_count")),
    // 자격 요건
    qual_university: parseTextArray(g("qual_university")) || null,
    qual_school_location: parseTextArray(g("qual_school_location")) as ScholarshipInsert["qual_school_location"] || null,
    qual_school_category: parseTextArray(g("qual_school_category")) as ScholarshipInsert["qual_school_category"] || null,
    qual_academic_year: g("qual_academic_year")
      ? parseTextArray(g("qual_academic_year")).map(Number).filter((n) => !isNaN(n))
      : null,
    qual_min_academic_year: parseOptionalInt(g("qual_min_academic_year")),
    qual_min_academic_semester: parseOptionalInt(g("qual_min_academic_semester")),
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
    can_overlap: bool("can_overlap"),
    required_documents: parseTextArray(g("required_documents")),
    apply_method: g("apply_method") ?? "",
    apply_url: g("apply_url") ?? "",
    homepage_url: g("homepage_url") || null,
    contact: g("contact") || null,
    note: g("note") || null,
    original_notice_image_url: originalNoticeImageUrls[0] ?? g("original_notice_image_url") ?? null,
    original_notice_image_urls: originalNoticeImageUrls.length > 0 ? originalNoticeImageUrls : null,
    original_notice_text: g("original_notice_text") || null,
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
    collected_at: new Date().toISOString(),
    is_verified: bool("is_verified"),
    list_on_home: bool("list_on_home"),
    is_recommended: bool("is_recommended"),
    recommended_sort_order: parseOptionalInt(g("recommended_sort_order")),
  };
}
