"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type {
  GenderType,
  NationalityType,
  MaritalStatusType,
  SchoolLocationType,
  SchoolCategoryType,
  EnrollmentStatusType,
  MilitaryStatusType,
  SpecialInfoType,
  ParentOccupationType,
  ParentCohabitationType,
  AdmissionType,
  OrgUnit,
} from "@/lib/database.types";

const FORM_ENROLLMENT_STATUSES = ["재학", "휴학", "수료/졸업유예"] as const;
const ADMISSION_TYPES = ["일반입학", "편입학", "재입학"] as const;
type FormEnrollmentStatus = (typeof FORM_ENROLLMENT_STATUSES)[number];
type FormAdmissionType = (typeof ADMISSION_TYPES)[number];

function toFormEnrollmentStatus(status: EnrollmentStatusType | null): FormEnrollmentStatus | "" {
  if (!status) return "";
  if (status === "휴학") return "휴학";
  if (status === "재학" || status === "신입생") return "재학";
  return "수료/졸업유예";
}

function toProfileEnrollmentStatus(status: string): EnrollmentStatusType | null {
  if (!status) return null;
  if (status === "재학" || status === "휴학") return status;
  if (status === "수료/졸업유예") return "수료";
  return null;
}

export type OnboardingFormData = {
  // 인적사항
  name: string;
  birth_year: string;
  birth_month: string;
  birth_day: string;
  gender: string;
  phone: string;
  address: string;
  nationality: string;
  marital_status: string;
  parent_cohabitation: string;
  parent_address: string;
  // 학적사항 - 공통
  school_location: string;
  school_category: string;
  admission_type: string;
  academic_year: string;
  academic_semester: string;
  enrollment_status: string;
  gpa: string;               // 전체 누적 학점
  gpa_last_semester: string; // 직전 학기 학점
  last_semester_earned_credits: string; // 직전 학기 이수학점
  // 학적사항 - 국내 대학 (org_unit 트리 선택)
  // 대학 루트부터 선택한 노드까지의 id 체인. 트리 깊이는 학교마다 다르므로
  // 대학-단과대-학과(3단계)뿐 아니라 대학-단과대-학부-학과(4단계) 등도 지원한다.
  // 마지막 단계(department)에 도달하지 못하고 멈춘 경우 major_undecided = true
  // (예: 1학년 학과 미정, 학부만 정해지고 세부 학과 미정 등)
  org_unit_path: string[];
  major_undecided: boolean;
  // org_unit_path의 마지막 노드가 실제 리프(department)인지 여부.
  // 클라이언트에서 트리 로딩 결과로 계산해 UI 검증에만 사용하며,
  // 서버는 이 값을 신뢰하지 않고 resolveChain에서 실제 unit_type을 재검증한다.
  org_unit_is_leaf: boolean;
  school_name: string;       // 대학교 표시명 (해외 대학은 직접 입력)
  department: string;        // 본전공 학과명 (해외 대학은 직접 입력)
  // 복수전공: 대학 아래(단과대부터)의 id 체인
  has_double_major: boolean;
  double_major_org_unit_path: string[];
  double_major_department: string;
  // 재정/가계
  income_level: string; // "0"~"10" | "unknown" | ""
  household_size: string;
  // 기타/특수
  special_info: string[];
  parent_occupation: string[];
  military_status: string;
};

export async function loadProfile(): Promise<OnboardingFormData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_onboarded) return null;

  let birth_year = "",
    birth_month = "",
    birth_day = "";
  if (profile.birth_date) {
    const parts = profile.birth_date.split("-");
    birth_year = parts[0];
    birth_month = String(parseInt(parts[1]));
    birth_day = String(parseInt(parts[2]));
  }

  const phone = profile.phone ?? "";
  const digits = phone.replace(/\D/g, "");
  let formattedPhone = phone;
  if (digits.length === 11) {
    formattedPhone = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    formattedPhone = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // org_unit 경로 복원 (path_ids = 루트부터 자기 자신까지)
  let orgUnitPath: string[] = [];
  let majorUndecided = false;
  let orgUnitIsLeaf = false;
  if (profile.org_unit_id) {
    const { data: unit } = await supabase
      .from("org_units")
      .select("id, unit_type, path_ids")
      .eq("id", profile.org_unit_id)
      .single();
    if (unit) {
      orgUnitPath = unit.path_ids.map(String);
      // department가 아닌 곳(대학/단과대/학부)에서 멈췄다면 "미정" 상태로 복원한다.
      // 트리 깊이가 3단계든 4단계든 동일하게 적용된다.
      majorUndecided = unit.unit_type !== "department";
      orgUnitIsLeaf = unit.unit_type === "department";
    }
  }

  let doubleMajorPath: string[] = [];
  if (profile.double_major_org_unit_id) {
    const { data: unit } = await supabase
      .from("org_units")
      .select("id, path_ids")
      .eq("id", profile.double_major_org_unit_id)
      .single();
    // 복수전공 경로는 대학 루트 제외 (단과대부터)
    if (unit) doubleMajorPath = unit.path_ids.slice(1).map(String);
  }

  return {
    name: profile.name ?? "",
    birth_year,
    birth_month,
    birth_day,
    gender: profile.gender ?? "",
    phone: formattedPhone,
    address: profile.address ?? "",
    nationality: profile.nationality ?? "",
    marital_status: profile.marital_status ?? "",
    parent_cohabitation: profile.parent_cohabitation ?? "",
    parent_address: profile.parent_address ?? "",
    school_location: profile.school_location ?? "",
    school_category: profile.school_category ?? "",
    admission_type: profile.admission_type ?? "",
    school_name: profile.school_name ?? "",
    department: profile.department ?? "",
    org_unit_path: orgUnitPath,
    major_undecided: majorUndecided,
    org_unit_is_leaf: orgUnitIsLeaf,
    has_double_major: profile.has_double_major ?? false,
    double_major_org_unit_path: doubleMajorPath,
    double_major_department: profile.double_major_department ?? "",
    academic_year: profile.academic_year ? String(profile.academic_year) : "",
    academic_semester: profile.academic_semester
      ? String(profile.academic_semester)
      : "",
    enrollment_status: toFormEnrollmentStatus(profile.enrollment_status),
    gpa: profile.gpa ? String(profile.gpa) : "",
    gpa_last_semester: profile.gpa_last_semester
      ? String(profile.gpa_last_semester)
      : "",
    last_semester_earned_credits:
      profile.last_semester_earned_credits !== null &&
      profile.last_semester_earned_credits !== undefined
        ? String(profile.last_semester_earned_credits)
        : "",
    income_level:
      profile.income_level !== null && profile.income_level !== undefined
        ? String(profile.income_level)
        : "",
    household_size: profile.household_size
      ? String(profile.household_size)
      : "",
    special_info: (profile.special_info as string[]) ?? [],
    parent_occupation: (profile.parent_occupation as string[]) ?? [],
    military_status: profile.military_status ?? "",
  };
}

type ChainNode = Pick<OrgUnit, "id" | "parent_id" | "unit_type" | "name" | "legacy_table" | "legacy_id">;

/**
 * 클라이언트가 보낸 id 체인이 실제 org_units 트리의 연속된 경로인지 검증하고
 * 노드 목록을 루트부터 순서대로 반환한다. 유효하지 않으면 null.
 */
async function resolveChain(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: number[],
  expectRootUniversity: boolean,
  parentOfFirst: number | null,
): Promise<ChainNode[] | null> {
  if (ids.length === 0) return null;
  const { data } = await supabase
    .from("org_units")
    .select("id, parent_id, unit_type, name, legacy_table, legacy_id")
    .in("id", ids);
  if (!data || data.length !== ids.length) return null;
  const byId = new Map(data.map((n) => [n.id, n]));
  const chain = ids.map((id) => byId.get(id)).filter(Boolean) as ChainNode[];
  if (chain.length !== ids.length) return null;
  if (expectRootUniversity && (chain[0].parent_id !== null || chain[0].unit_type !== "university")) {
    return null;
  }
  if (!expectRootUniversity && chain[0].parent_id !== parentOfFirst) return null;
  for (let i = 1; i < chain.length; i += 1) {
    if (chain[i].parent_id !== chain[i - 1].id) return null;
  }
  return chain;
}

/** 체인에서 legacy 테이블별 id 추출 (기존 매칭/통계 호환용) */
function legacyIdOf(chain: ChainNode[], table: string): number | null {
  const node = chain.find((n) => n.legacy_table === table);
  return node ? node.legacy_id : null;
}

/** 체인에서 매칭용 학과 텍스트: 단과대(2번째) 아래 가장 깊은 노드 이름 */
function departmentTextOf(chain: ChainNode[], collegeIndex: number): string | null {
  if (chain.length <= collegeIndex + 1) return null;
  return chain[chain.length - 1].name;
}

export async function saveProfile(
  data: OnboardingFormData,
  redirectTo: string = "/"
): Promise<{ error: string } | void> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/auth");

  const validationError = validateProfile(data);
  if (validationError) return { error: validationError };

  const isKorean = data.school_location === "국내 대학";

  // ── org_unit 체인 검증 + 파생값 계산 (국내 대학) ────────────────────────
  let orgUnitId: number | null = null;
  let doubleMajorOrgUnitId: number | null = null;
  let schoolName = data.school_name || null;
  let departmentText = data.department || null;
  let doubleMajorText: string | null = null;
  let universityLegacyId: number | null = null;
  let collegeLegacyId: number | null = null;
  let departmentLegacyId: number | null = null;
  let dmCollegeLegacyId: number | null = null;
  let dmDepartmentLegacyId: number | null = null;

  if (isKorean) {
    const ids = data.org_unit_path.map((v) => parseInt(v)).filter(Number.isFinite);
    const chain = await resolveChain(supabase, ids, true, null);
    if (!chain || chain.length < 2) {
      return { error: "대학교/단과대학 선택이 올바르지 않습니다. 다시 선택해주세요." };
    }
    // 트리 깊이(3단계/4단계 등)와 무관하게, 실제 리프(department)까지 도달했는지는
    // 클라이언트가 아니라 방금 조회한 실제 org_units 체인 기준으로 판단한다.
    const lastUnitType = chain[chain.length - 1].unit_type;
    if (lastUnitType !== "department" && !data.major_undecided) {
      return { error: "학과를 선택하거나 '아직 정해지지 않았어요'를 체크해주세요." };
    }
    orgUnitId = chain[chain.length - 1].id;
    schoolName = chain[0].name;
    departmentText = departmentTextOf(chain, 1);
    universityLegacyId = legacyIdOf(chain, "universities");
    collegeLegacyId = legacyIdOf(chain, "university_colleges");
    departmentLegacyId = legacyIdOf(chain, "university_departments");

    if (data.has_double_major) {
      const dmIds = data.double_major_org_unit_path
        .map((v) => parseInt(v))
        .filter(Number.isFinite);
      const dmChain = await resolveChain(supabase, dmIds, false, chain[0].id);
      if (!dmChain || dmChain.length < 2) {
        return { error: "복수전공 선택이 올바르지 않습니다. 다시 선택해주세요." };
      }
      doubleMajorOrgUnitId = dmChain[dmChain.length - 1].id;
      doubleMajorText = dmChain[dmChain.length - 1].name;
      dmCollegeLegacyId = legacyIdOf(dmChain, "university_colleges");
      dmDepartmentLegacyId = legacyIdOf(dmChain, "university_departments");
    }
  }

  const birth_date =
    data.birth_year && data.birth_month && data.birth_day
      ? `${data.birth_year}-${data.birth_month.padStart(2, "0")}-${data.birth_day.padStart(2, "0")}`
      : null;

  const income_level =
    !data.income_level || data.income_level === "unknown"
      ? null
      : parseInt(data.income_level);
  const normalizedName = data.name.trim();
  const normalizedPhone = data.phone.replace(/\D/g, "");
  const normalizedParentAddress = data.parent_address.trim();
  const parentAddress =
    data.parent_cohabitation === "별거" ? normalizedParentAddress || null : null;

  const { error } = await supabase
    .from("profiles")
    .update({
      // 인적사항
      name: normalizedName || null,
      birth_date,
      gender: (data.gender || null) as GenderType | null,
      phone: data.phone || null,
      address: data.address || null,
      nationality: (data.nationality || null) as NationalityType | null,
      marital_status: (data.marital_status || null) as MaritalStatusType | null,
      parent_cohabitation:
        (data.parent_cohabitation || null) as ParentCohabitationType | null,
      parent_address: parentAddress,
      // 학적사항
      school_location: (data.school_location || null) as SchoolLocationType | null,
      school_category: (data.school_category || null) as SchoolCategoryType | null,
      admission_type: (data.admission_type || null) as AdmissionType | null,
      school_name: schoolName,
      department: departmentText,
      org_unit_id: orgUnitId,
      // legacy FK (기존 매칭/통계 호환, org_units에서 파생)
      university_id: universityLegacyId,
      college_id: collegeLegacyId,
      department_id: departmentLegacyId,
      has_double_major: isKorean ? data.has_double_major : false,
      double_major_org_unit_id: doubleMajorOrgUnitId,
      double_major_college_id: dmCollegeLegacyId,
      double_major_department_id: dmDepartmentLegacyId,
      double_major_department: doubleMajorText,
      academic_year: data.academic_year ? parseInt(data.academic_year) : null,
      academic_semester: data.academic_semester
        ? parseInt(data.academic_semester)
        : null,
      enrollment_status: toProfileEnrollmentStatus(data.enrollment_status),
      gpa: data.gpa ? parseFloat(data.gpa) : null,
      gpa_last_semester: data.gpa_last_semester
        ? parseFloat(data.gpa_last_semester)
        : null,
      last_semester_earned_credits: data.last_semester_earned_credits
        ? parseFloat(data.last_semester_earned_credits)
        : null,
      // 재정/가계
      income_level,
      household_size: data.household_size ? parseInt(data.household_size) : null,
      // 기타/특수
      special_info: (data.special_info.length > 0 ? data.special_info : null) as SpecialInfoType[] | null,
      parent_occupation: (data.parent_occupation.length > 0 ? data.parent_occupation : null) as ParentOccupationType[] | null,
      military_status: (data.military_status || null) as MilitaryStatusType | null,
      is_onboarded: true,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };
  
  const { error: authError } = await supabase.auth.updateUser({
    data: {
      name: normalizedName,
      full_name: normalizedName,
      phone: normalizedPhone || null,
    },
  });

  if (authError) return { error: authError.message };

  redirect(redirectTo);
}

function validateProfile(data: OnboardingFormData): string | null {
  if (!data.name.trim()) return "이름을 입력해주세요.";
  if (!data.birth_year || !data.birth_month || !data.birth_day) {
    return "생년월일을 선택해주세요.";
  }
  if (!data.gender) return "성별을 선택해주세요.";
  if (!data.phone) return "연락처를 입력해주세요.";
  if (!data.address) return "주소지를 입력해주세요.";
  if (!data.nationality) return "국적을 선택해주세요.";
  if (!data.parent_cohabitation) return "부모님과 동거 여부를 선택해주세요.";
  if (data.parent_cohabitation === "별거" && !data.parent_address.trim()) {
    return "부모님 주소를 입력해주세요.";
  }
  if (!data.school_location) return "학교 소재를 선택해주세요.";
  if (!data.school_category) return "학교 유형을 선택해주세요.";
  if (data.admission_type && !ADMISSION_TYPES.includes(data.admission_type as FormAdmissionType)) {
    return "입학 구분 값이 올바르지 않습니다.";
  }

  if (data.school_location === "국내 대학") {
    if (data.org_unit_path.length < 1) return "대학교를 선택해주세요.";
    if (data.org_unit_path.length < 2) return "단과대학을 선택해주세요.";
    // 리프(학과) 도달 여부는 트리 깊이가 학교마다 달라 여기서 판단할 수 없다.
    // saveProfile이 실제 org_units 체인을 조회해 최종 확인한다.
  } else {
    if (!data.school_name.trim()) return "소속 대학교를 입력해주세요.";
    if (!data.department.trim()) return "소속 학과를 입력해주세요.";
  }

  if (!data.academic_year) return "학년을 선택해주세요.";
  if (!data.academic_semester) return "학기를 선택해주세요.";
  if (!data.enrollment_status) return "재학 상태를 선택해주세요.";
  if (!FORM_ENROLLMENT_STATUSES.includes(data.enrollment_status as FormEnrollmentStatus)) {
    return "재학 상태 값이 올바르지 않습니다.";
  }
  if (!data.income_level) return "소득분위를 선택해주세요.";

  if (data.school_location === "국내 대학" && data.has_double_major) {
    if (data.double_major_org_unit_path.length < 1) return "복수전공 단과대학을 선택해주세요.";
    if (data.double_major_org_unit_path.length < 2) return "복수전공 학과를 선택해주세요.";
  }

  const gpa = data.gpa ? parseFloat(data.gpa) : null;
  if (gpa !== null && (!Number.isFinite(gpa) || gpa < 0 || gpa > 4.5)) {
    return "누적 학점은 0.0 ~ 4.5 사이로 입력해주세요.";
  }

  const lastGpa = data.gpa_last_semester ? parseFloat(data.gpa_last_semester) : null;
  if (
    lastGpa !== null &&
    (!Number.isFinite(lastGpa) || lastGpa < 0 || lastGpa > 4.5)
  ) {
    return "직전 학기 학점은 0.0 ~ 4.5 사이로 입력해주세요.";
  }

  const lastSemesterCredits = data.last_semester_earned_credits
    ? parseFloat(data.last_semester_earned_credits)
    : null;
  if (lastSemesterCredits === null) {
    return "직전학기 이수학점을 입력해주세요.";
  }
  if (!Number.isFinite(lastSemesterCredits) || lastSemesterCredits < 0 || lastSemesterCredits > 30) {
    return "직전학기 이수학점은 0 ~ 30 사이로 입력해주세요.";
  }

  return null;
}
