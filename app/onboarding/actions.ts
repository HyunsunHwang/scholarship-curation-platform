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
} from "@/lib/database.types";

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
  // 학적사항 - 공통
  school_location: string;
  school_category: string;
  academic_year: string;
  academic_semester: string;
  enrollment_status: string;
  gpa: string;               // 전체 누적 학점
  gpa_last_semester: string; // 직전 학기 학점
  // 학적사항 - 국내 대학 (계층형 선택)
  university_id: string;
  school_name: string;       // 대학교 표시명 (매칭용 텍스트)
  college_id: string;
  department_id: string;
  department: string;        // 본전공 학과명 (매칭용 텍스트)
  // 복수전공
  has_double_major: boolean;
  double_major_college_id: string;
  double_major_department_id: string;
  double_major_department: string; // 복수전공 학과명 (매칭용 텍스트)
  // 학적사항 - 해외 대학 (텍스트 입력, 위 school_name/department 재사용)
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
    school_location: profile.school_location ?? "",
    school_category: profile.school_category ?? "",
    school_name: profile.school_name ?? "",
    department: profile.department ?? "",
    university_id: profile.university_id ? String(profile.university_id) : "",
    college_id: profile.college_id ? String(profile.college_id) : "",
    department_id: profile.department_id ? String(profile.department_id) : "",
    has_double_major: profile.has_double_major ?? false,
    double_major_college_id: profile.double_major_college_id
      ? String(profile.double_major_college_id)
      : "",
    double_major_department_id: profile.double_major_department_id
      ? String(profile.double_major_department_id)
      : "",
    double_major_department: profile.double_major_department ?? "",
    academic_year: profile.academic_year ? String(profile.academic_year) : "",
    academic_semester: profile.academic_semester
      ? String(profile.academic_semester)
      : "",
    enrollment_status: profile.enrollment_status ?? "",
    gpa: profile.gpa ? String(profile.gpa) : "",
    gpa_last_semester: profile.gpa_last_semester
      ? String(profile.gpa_last_semester)
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

  const birth_date =
    data.birth_year && data.birth_month && data.birth_day
      ? `${data.birth_year}-${data.birth_month.padStart(2, "0")}-${data.birth_day.padStart(2, "0")}`
      : null;

  const income_level =
    !data.income_level || data.income_level === "unknown"
      ? null
      : parseInt(data.income_level);

  const { error } = await supabase
    .from("profiles")
    .update({
      // 인적사항
      name: data.name || null,
      birth_date,
      gender: (data.gender || null) as GenderType | null,
      phone: data.phone || null,
      address: data.address || null,
      nationality: (data.nationality || null) as NationalityType | null,
      marital_status: (data.marital_status || null) as MaritalStatusType | null,
      // 학적사항
      school_location: (data.school_location || null) as SchoolLocationType | null,
      school_category: (data.school_category || null) as SchoolCategoryType | null,
      school_name: data.school_name || null,
      department: data.department || null,
      university_id: data.university_id ? parseInt(data.university_id) : null,
      college_id: data.college_id ? parseInt(data.college_id) : null,
      department_id: data.department_id ? parseInt(data.department_id) : null,
      has_double_major: data.has_double_major,
      double_major_college_id: data.double_major_college_id
        ? parseInt(data.double_major_college_id)
        : null,
      double_major_department_id: data.double_major_department_id
        ? parseInt(data.double_major_department_id)
        : null,
      double_major_department: data.double_major_department || null,
      academic_year: data.academic_year ? parseInt(data.academic_year) : null,
      academic_semester: data.academic_semester
        ? parseInt(data.academic_semester)
        : null,
      enrollment_status: (data.enrollment_status || null) as EnrollmentStatusType | null,
      gpa: data.gpa ? parseFloat(data.gpa) : null,
      gpa_last_semester: data.gpa_last_semester
        ? parseFloat(data.gpa_last_semester)
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

  redirect(redirectTo);
}
