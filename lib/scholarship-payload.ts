import type { Database } from "@/lib/database.types";

export type ScholarshipInsert =
  Database["public"]["Tables"]["scholarships"]["Insert"];

export const SCHOLARSHIP_TYPES = ["on_campus", "off_campus"] as const;

// ─────────────────────────────────────────────────────────────────
// FormData → DB payload 변환 헬퍼 (createScholarship / promoteNotice 공유)
// ─────────────────────────────────────────────────────────────────
export function parseOptionalFloat(val: string | null): number | null {
  if (!val || val.trim() === "") return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

export function parseOptionalInt(val: string | null): number | null {
  if (!val || val.trim() === "") return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

export function parseTextArray(val: string | null): string[] {
  if (!val || val.trim() === "") return [];
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseJsonTextArray(val: string | null): string[] {
  if (!val || val.trim() === "") return [];
  try {
    const parsed = JSON.parse(val);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === "string" && item.trim() !== ""
    );
  } catch {
    return [];
  }
}

export function parseScholarshipType(
  val: string | null
): ScholarshipInsert["scholarship_type"] {
  if (
    val &&
    SCHOLARSHIP_TYPES.includes(val as (typeof SCHOLARSHIP_TYPES)[number])
  ) {
    return val as ScholarshipInsert["scholarship_type"];
  }
  return "off_campus";
}

export function getAdminReturnPath(
  formData: FormData,
  fallback: string
): string {
  const raw = (formData.get("admin_return_path") as string | null)?.trim();
  if (!raw) return fallback;
  if (!raw.startsWith("/admin")) return fallback;
  return raw;
}

export function buildScholarshipPayload(formData: FormData): ScholarshipInsert {
  const g = (key: string) => formData.get(key) as string | null;
  // hidden+checkbox 패턴은 formData.get()이 hidden(false)을 먼저 반환하므로
  // getAll()로 "true"가 포함됐는지 확인해야 함
  const bool = (key: string) => formData.getAll(key).includes("true");
  const originalNoticeImageUrls = parseJsonTextArray(
    g("original_notice_image_urls")
  );
  const mappedEnrollmentStatuses = mapEnrollmentStatusesForStorage(
    parseTextArray(g("qual_enrollment_status"))
  );

  return {
    name: g("name") ?? "",
    organization: g("organization") ?? "",
    scholarship_type: parseScholarshipType(g("scholarship_type")),
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
    qual_enrollment_status: mappedEnrollmentStatuses.length > 0
      ? (mappedEnrollmentStatuses as ScholarshipInsert["qual_enrollment_status"])
      : null,
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
    qual_admission_type: parseTextArray(g("qual_admission_type")) as ScholarshipInsert["qual_admission_type"] || null,
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
    is_advertisement: bool("is_advertisement"),
    ad_job_role: g("ad_job_role") || null,
    ad_required_skills: parseTextArray(g("ad_required_skills")) || null,
    ad_location: g("ad_location") || null,
    is_recommended: bool("is_recommended"),
    recommended_sort_order: parseOptionalInt(g("recommended_sort_order")),
  };
}

function mapEnrollmentStatusesForStorage(values: string[]): string[] {
  const mapped = new Set<string>();
  for (const value of values) {
    if (value === "재학" || value === "휴학") {
      mapped.add(value);
      continue;
    }
    if (value === "수료/졸업유예") {
      mapped.add("수료");
      mapped.add("졸업예정");
      continue;
    }
    // Legacy compatibility if old labels are still posted.
    if (value === "신입생") {
      mapped.add("재학");
    } else if (value === "초과이수기" || value === "수료" || value === "졸업예정" || value === "졸업") {
      mapped.add("수료");
      mapped.add("졸업예정");
    }
  }
  return [...mapped];
}
