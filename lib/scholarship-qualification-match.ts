import { createClient } from "@/lib/supabase/server";
import { todayKoreaYYYYMMDD } from "@/lib/scholarship-dates";
import type { Database, EnrollmentStatusType } from "@/lib/database.types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ScholarshipRow = Database["public"]["Tables"]["scholarships"]["Row"];

/** DB 기반으로 자동 확인 가능한 지원자격 항목 (get_matched_scholarships RPC와 동일한 필드 집합) */
export type QualMatchItem = {
  key: string;
  label: string;
  value: string;
  satisfied: boolean;
};

/**
 * "내 프로필 자동 확인" 섹션 상태
 * - none: 이 장학금엔 자동 확인 가능한 조건이 없음 → 섹션 자체를 숨김
 * - guest: 조건은 있으나 비로그인/온보딩 전 → 로그인·프로필 등록 유도
 * - ready: 로그인 + 온보딩 완료 → 항목별 충족 여부 표시
 */
export type AutoCheckState =
  | { kind: "none" }
  | { kind: "guest"; ctaHref: string }
  | { kind: "ready"; items: QualMatchItem[] };

/** 이 필드들이 하나라도 있으면 "내 프로필 자동 확인" 섹션을 노출한다. get_matched_scholarships가 실제로 필터링하는 필드와 동일하게 유지할 것. */
export function hasAutoCheckableQualifications(s: ScholarshipRow): boolean {
  return !!(
    (s.qual_university && s.qual_university.length > 0) ||
    (s.qual_school_location && s.qual_school_location.length > 0) ||
    (s.qual_school_category && s.qual_school_category.length > 0) ||
    (s.qual_admission_type && s.qual_admission_type.length > 0) ||
    (s.qual_enrollment_status && s.qual_enrollment_status.length > 0) ||
    (s.qual_academic_year && s.qual_academic_year.length > 0) ||
    (s.qual_major && s.qual_major.length > 0) ||
    s.qual_gpa_min != null ||
    s.qual_gpa_last_semester_min != null ||
    s.qual_income_level_min != null ||
    s.qual_income_level_max != null ||
    s.qual_household_size_max != null ||
    !!s.qual_gender ||
    s.qual_age_min != null ||
    s.qual_age_max != null ||
    (s.qual_region && s.qual_region.length > 0) ||
    !!s.qual_nationality ||
    (s.qual_special_info && s.qual_special_info.length > 0) ||
    (s.qual_parent_occupation && s.qual_parent_occupation.length > 0) ||
    !!s.qual_military_status
  );
}

/** 한국 달력 기준 만 나이 (Postgres의 DATE_PART('year', AGE(birth_date))와 동일한 정의) */
function calculateKoreaAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const match = birthDate.split("T")[0].match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, by, bm, bd] = match.map(Number);
  const [ty, tm, td] = todayKoreaYYYYMMDD().split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** get_matched_scholarships의 재학 상태 매칭 특례를 그대로 재현 */
function matchesEnrollmentStatus(
  required: string,
  profileStatus: EnrollmentStatusType | null,
  academicYear: number | null
): boolean {
  if (!profileStatus) return false;
  if (required === profileStatus) return true;
  if (required === "재학" && profileStatus === "신입생") return true;
  if (required === "신입생" && profileStatus === "재학" && academicYear === 1) return true;
  if (
    required === "졸업예정" &&
    (["수료", "초과이수기", "졸업예정", "졸업"] as EnrollmentStatusType[]).includes(profileStatus)
  ) {
    return true;
  }
  if (
    required === "졸업예정" &&
    profileStatus === "재학" &&
    academicYear != null &&
    academicYear >= 4
  ) {
    return true;
  }
  return false;
}

function fuzzyIncludes(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a);
}

function matchesMajor(required: string, candidates: (string | null)[]): boolean {
  const target = required.trim();
  if (!target) return false;
  return candidates.some((c) => !!c && fuzzyIncludes(c, target));
}

type ResolvedNames = {
  universityName: string | null;
  collegeName: string | null;
  doubleMajorCollegeName: string | null;
  departmentName: string | null;
  doubleMajorDepartmentName: string | null;
};

async function resolveProfileNames(
  supabase: SupabaseServerClient,
  profile: ProfileRow
): Promise<ResolvedNames> {
  const universityIds = [profile.university_id].filter((v): v is number => v != null);
  const collegeIds = Array.from(
    new Set([profile.college_id, profile.double_major_college_id].filter((v): v is number => v != null))
  );
  const departmentIds = Array.from(
    new Set(
      [profile.department_id, profile.double_major_department_id].filter((v): v is number => v != null)
    )
  );

  const [universitiesRes, collegesRes, departmentsRes] = await Promise.all([
    universityIds.length > 0
      ? supabase.from("universities").select("id, name").in("id", universityIds)
      : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    collegeIds.length > 0
      ? supabase.from("university_colleges").select("id, name").in("id", collegeIds)
      : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    departmentIds.length > 0
      ? supabase.from("university_departments").select("id, name").in("id", departmentIds)
      : Promise.resolve({ data: [] as { id: number; name: string }[] }),
  ]);

  const findName = (rows: { id: number; name: string }[] | null, id: number | null) =>
    id == null ? null : rows?.find((r) => r.id === id)?.name ?? null;

  return {
    universityName: findName(universitiesRes.data, profile.university_id),
    collegeName: findName(collegesRes.data, profile.college_id),
    doubleMajorCollegeName: findName(collegesRes.data, profile.double_major_college_id),
    departmentName: findName(departmentsRes.data, profile.department_id),
    doubleMajorDepartmentName: findName(departmentsRes.data, profile.double_major_department_id),
  };
}

/**
 * 로그인한 사용자의 프로필과 장학금의 지원자격을 항목별로 비교한다.
 * `get_matched_scholarships` SQL RPC와 동일한 조건을 재현하므로, 두 로직을 함께 수정할 것.
 * 프로필이 없거나 온보딩 전이면 null.
 */
export async function getScholarshipQualMatch(
  supabase: SupabaseServerClient,
  userId: string,
  scholarship: ScholarshipRow
): Promise<QualMatchItem[] | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || !profile.is_onboarded) return null;

  const names = await resolveProfileNames(supabase, profile);
  const s = scholarship;
  const items: QualMatchItem[] = [];

  if (s.qual_university && s.qual_university.length > 0) {
    items.push({
      key: "university",
      label: "대상 대학교",
      value: s.qual_university.join(", "),
      satisfied:
        (!!names.universityName && s.qual_university.includes(names.universityName)) ||
        (!!profile.school_name && s.qual_university.includes(profile.school_name)),
    });
  }

  if (s.qual_school_location && s.qual_school_location.length > 0) {
    items.push({
      key: "school_location",
      label: "학교 소재지",
      value: s.qual_school_location.join(", "),
      satisfied: !!profile.school_location && s.qual_school_location.includes(profile.school_location),
    });
  }

  if (s.qual_school_category && s.qual_school_category.length > 0) {
    items.push({
      key: "school_category",
      label: "대학 유형",
      value: s.qual_school_category.join(", "),
      satisfied: !!profile.school_category && s.qual_school_category.includes(profile.school_category),
    });
  }

  if (s.qual_admission_type && s.qual_admission_type.length > 0) {
    items.push({
      key: "admission_type",
      label: "입학 구분",
      value: s.qual_admission_type.join(", "),
      satisfied: !!profile.admission_type && s.qual_admission_type.includes(profile.admission_type),
    });
  }

  if (s.qual_enrollment_status && s.qual_enrollment_status.length > 0) {
    items.push({
      key: "enrollment_status",
      label: "재학 상태",
      value: s.qual_enrollment_status.join(", "),
      satisfied: s.qual_enrollment_status.some((req) =>
        matchesEnrollmentStatus(req, profile.enrollment_status, profile.academic_year)
      ),
    });
  }

  if (s.qual_academic_year && s.qual_academic_year.length > 0) {
    items.push({
      key: "academic_year",
      label: "학년",
      value: s.qual_academic_year.map((y) => `${y}학년`).join(", "),
      satisfied: profile.academic_year != null && s.qual_academic_year.includes(profile.academic_year),
    });
  }

  if (s.qual_major && s.qual_major.length > 0) {
    const candidates = [
      names.departmentName,
      profile.department,
      names.collegeName,
      names.doubleMajorDepartmentName,
      profile.double_major_department,
      names.doubleMajorCollegeName,
    ];
    items.push({
      key: "major",
      label: "전공",
      value: s.qual_major.join(", "),
      satisfied: s.qual_major.some((m) => matchesMajor(m, candidates)),
    });
  }

  if (s.qual_gpa_min != null) {
    items.push({
      key: "gpa_min",
      label: "학점 (누적)",
      value: `${s.qual_gpa_min} 이상`,
      satisfied: profile.gpa != null && profile.gpa >= s.qual_gpa_min,
    });
  }

  if (s.qual_gpa_last_semester_min != null) {
    items.push({
      key: "gpa_last_semester_min",
      label: "학점 (직전)",
      value: `${s.qual_gpa_last_semester_min} 이상`,
      satisfied:
        profile.gpa_last_semester != null && profile.gpa_last_semester >= s.qual_gpa_last_semester_min,
    });
  }

  if (s.qual_income_level_min != null || s.qual_income_level_max != null) {
    const value =
      s.qual_income_level_min != null && s.qual_income_level_max != null
        ? `${s.qual_income_level_min} ~ ${s.qual_income_level_max}분위`
        : s.qual_income_level_min != null
          ? `${s.qual_income_level_min}분위 이상`
          : `${s.qual_income_level_max}분위 이하`;
    items.push({
      key: "income_level",
      label: "소득 분위",
      value,
      // get_matched_scholarships는 qual_income_level_max 기준으로만 필터링하므로 동일하게 맞춘다.
      satisfied:
        s.qual_income_level_max == null ||
        (profile.income_level != null &&
          profile.income_level <= s.qual_income_level_max &&
          profile.income_level >= (s.qual_income_level_min ?? 1)),
    });
  }

  if (s.qual_household_size_max != null) {
    items.push({
      key: "household_size_max",
      label: "가구원 수",
      value: `${s.qual_household_size_max}인 이하`,
      satisfied: profile.household_size != null && profile.household_size <= s.qual_household_size_max,
    });
  }

  if (s.qual_gender) {
    items.push({
      key: "gender",
      label: "성별",
      value: s.qual_gender,
      satisfied: profile.gender === s.qual_gender,
    });
  }

  if (s.qual_age_min != null || s.qual_age_max != null) {
    const age = calculateKoreaAge(profile.birth_date);
    const parts: string[] = [];
    if (s.qual_age_min != null) parts.push(`만 ${s.qual_age_min}세 이상`);
    if (s.qual_age_max != null) parts.push(`만 ${s.qual_age_max}세 이하`);
    items.push({
      key: "age",
      label: "연령",
      value: parts.join(" ~ "),
      satisfied:
        age != null &&
        (s.qual_age_min == null || age >= s.qual_age_min) &&
        (s.qual_age_max == null || age <= s.qual_age_max),
    });
  }

  if (s.qual_region && s.qual_region.length > 0) {
    items.push({
      key: "region",
      label: "지역",
      value: s.qual_region.join(", "),
      satisfied: !!profile.address && s.qual_region.some((r) => profile.address!.includes(r)),
    });
  }

  if (s.qual_nationality) {
    items.push({
      key: "nationality",
      label: "국적",
      value: s.qual_nationality,
      satisfied: profile.nationality === s.qual_nationality,
    });
  }

  if (s.qual_special_info && s.qual_special_info.length > 0) {
    items.push({
      key: "special_info",
      label: "특수 정보",
      value: s.qual_special_info.join(", "),
      satisfied:
        !!profile.special_info &&
        s.qual_special_info.some((req) => (profile.special_info as string[]).includes(req)),
    });
  }

  if (s.qual_parent_occupation && s.qual_parent_occupation.length > 0) {
    items.push({
      key: "parent_occupation",
      label: "부모 직업",
      value: s.qual_parent_occupation.join(", "),
      satisfied:
        !!profile.parent_occupation &&
        s.qual_parent_occupation.some((req) => (profile.parent_occupation as string[]).includes(req)),
    });
  }

  if (s.qual_military_status) {
    items.push({
      key: "military_status",
      label: "병역사항",
      value: s.qual_military_status,
      satisfied: profile.military_status === s.qual_military_status,
    });
  }

  return items;
}
