export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ── Enum 타입 ──────────────────────────────────────────────────────────────

export type GenderType = "남성" | "여성";
export type NationalityType = "내국인" | "외국인";
export type MaritalStatusType = "미혼" | "기혼";
export type MilitaryStatusType = "군필" | "미필" | "비대상" | "면제";
export type SchoolLocationType = "국내 대학" | "해외 대학";
export type SchoolCategoryType = "4년제" | "전문대" | "대학원" | "사이버대" | "방통대";
export type EnrollmentStatusType =
  | "신입학"
  | "재학"
  | "휴학"
  | "초과학기"
  | "수료"
  | "졸업유예"
  | "졸업";
export type SpecialInfoType =
  | "다문화가정"
  | "기초생활수급자"
  | "차상위계층"
  | "장애인"
  | "새터민"
  | "농어촌자녀"
  | "보훈대상자"
  | "조부모가정"
  | "다자녀"
  | "한부모가정"
  | "학생가장"
  | "북한이탈주민"
  | "자립준비청년";
export type ParentOccupationType =
  | "직업군인"
  | "군무원"
  | "농축어업인"
  | "건설근로자"
  | "소상공인"
  | "경찰/소방관"
  | "택배기사"
  | "환경미화원"
  | "연극인";
export type InstitutionType =
  | "국가기관"
  | "지방자치단체"
  | "공공기관"
  | "기업"
  | "재단법인"
  | "학교법인"
  | "언론/방송"
  | "종교단체"
  | "기타";
export type SupportCategory =
  | "등록금"
  | "생활비"
  | "학업장려금"
  | "연구비"
  | "해외연수비"
  | "기타";

// ── Database 타입 ─────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          is_onboarded: boolean;
          // 인적사항
          name: string | null;
          birth_date: string | null;
          gender: GenderType | null;
          phone: string | null;
          address: string | null;
          nationality: NationalityType | null;
          marital_status: MaritalStatusType | null;
          // 학적사항
          school_location: SchoolLocationType | null;
          school_category: SchoolCategoryType | null;
          school_name: string | null;
          department: string | null;
          academic_year: number | null;
          academic_semester: number | null;
          enrollment_status: EnrollmentStatusType | null;
          gpa: number | null;
          // 재정/가계
          income_level: number | null;
          household_size: number | null;
          // 기타/특수
          special_info: SpecialInfoType[] | null;
          parent_occupation: ParentOccupationType[] | null;
          military_status: MilitaryStatusType | null;
          // 타임스탬프
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          is_onboarded?: boolean;
          name?: string | null;
          birth_date?: string | null;
          gender?: GenderType | null;
          phone?: string | null;
          address?: string | null;
          nationality?: NationalityType | null;
          marital_status?: MaritalStatusType | null;
          school_location?: SchoolLocationType | null;
          school_category?: SchoolCategoryType | null;
          school_name?: string | null;
          department?: string | null;
          academic_year?: number | null;
          academic_semester?: number | null;
          enrollment_status?: EnrollmentStatusType | null;
          gpa?: number | null;
          income_level?: number | null;
          household_size?: number | null;
          special_info?: SpecialInfoType[] | null;
          parent_occupation?: ParentOccupationType[] | null;
          military_status?: MilitaryStatusType | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      scholarships: {
        Row: {
          id: number;
          name: string;
          organization: string;
          institution_type: InstitutionType;
          support_types: SupportCategory[];
          support_amount: number;
          apply_start_date: string;
          apply_end_date: string;
          announcement_date: string | null;
          selection_count: number | null;
          // 자격 조건
          qual_school_location: SchoolLocationType[] | null;
          qual_school_category: SchoolCategoryType[] | null;
          qual_academic_year: number[] | null;
          qual_enrollment_status: EnrollmentStatusType[] | null;
          qual_major: string[] | null;
          qual_gpa_min: number | null;
          qual_income_level_min: number | null;
          qual_income_level_max: number | null;
          qual_household_size_max: number | null;
          qual_gender: GenderType | null;
          qual_age_min: number | null;
          qual_age_max: number | null;
          qual_region: string[] | null;
          qual_nationality: NationalityType | null;
          qual_special_info: SpecialInfoType[] | null;
          qual_parent_occupation: ParentOccupationType[] | null;
          qual_military_status: MilitaryStatusType | null;
          // 지원 정보
          can_overlap: boolean;
          required_documents: string[];
          apply_method: string;
          apply_url: string;
          homepage_url: string | null;
          contact: string | null;
          note: string | null;
          // 선발 절차
          selection_stages: number;
          selection_stage_1: string;
          selection_stage_2: string | null;
          selection_stage_3: string | null;
          selection_stage_4: string | null;
          selection_stage_5: string | null;
          selection_note: string | null;
          selection_stage_1_schedule: string | null;
          selection_stage_2_schedule: string | null;
          selection_stage_3_schedule: string | null;
          selection_stage_4_schedule: string | null;
          selection_stage_5_schedule: string | null;
          // 관리
          collected_at: string;
          is_verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["scholarships"]["Row"],
          "id" | "created_at" | "updated_at"
        > &
          Partial<
            Pick<
              Database["public"]["Tables"]["scholarships"]["Row"],
              "created_at" | "updated_at"
            >
          >;
        Update: Partial<Database["public"]["Tables"]["scholarships"]["Insert"]>;
      };
    };
    Functions: {
      get_matched_scholarships: {
        Args: { p_user_id: string };
        Returns: Database["public"]["Tables"]["scholarships"]["Row"][];
      };
    };
  };
}

// ── 편의 타입 (컴포넌트에서 바로 사용) ────────────────────────────────────

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
export type Scholarship = Database["public"]["Tables"]["scholarships"]["Row"];
