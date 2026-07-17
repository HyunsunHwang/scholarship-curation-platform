import type { Contest, Database } from "@/lib/database.types";
import type {
  ScholarshipDetail,
  SelectionStageDetail,
} from "@/app/scholarships/[id]/ScholarshipTabs";
import type { AutoCheckState } from "@/lib/scholarship-qualification-match";
import type { BenefitHighlight } from "@/lib/benefit-categories";
import { contentKindHref, contentKindLabel } from "@/lib/content-categories";

export type AnnouncementKind =
  | "scholarship"
  | "contest"
  | "education"
  | "activity";

export type AnnouncementDetailPayload = {
  kind: AnnouncementKind;
  id: number;
  href: string;
  name: string;
  organization: string;
  kindLabel: string;
  posterImageUrl: string | null;
  applyUrl: string;
  viewCount: number;
  scrapCount: number;
  initialBookmarked: boolean;
  interestLabels: string[];
  benefits: BenefitHighlight[];
  scholarship: ScholarshipDetail;
  selectionStages: SelectionStageDetail[];
  autoCheck: AutoCheckState;
  hideQualificationSections: boolean;
  contact: string | null;
  adJobRole: string | null;
};

type ScholarshipRow = Database["public"]["Tables"]["scholarships"]["Row"];

export function contestToScholarshipDetail(contest: Contest): ScholarshipDetail {
  return {
    id: contest.id,
    name: contest.name,
    organization: contest.organization,
    institution_type: contest.organization_type || "기타",
    apply_url: contest.apply_url,
    homepage_url: contest.homepage_url,
    support_types: [],
    apply_start_date: contest.apply_start_date,
    apply_end_date: contest.apply_end_date || "2099-12-31",
    selection_count: contest.selection_count,
    announcement_date: contest.announcement_date,
    can_overlap: null,
    qual_gpa_min: null,
    qual_gpa_last_semester_min: null,
    qual_last_semester_earned_credits_min: null,
    qual_income_level_max: null,
    qual_income_level_min: null,
    qual_household_size_max: null,
    qual_gender: null,
    qual_age_min: null,
    qual_age_max: null,
    qual_region: null,
    qual_major: null,
    qual_special_info: null,
    qual_extra_requirements: null,
    qual_parent_occupation: null,
    qual_military_status: null,
    qual_nationality: null,
    qual_admission_type: null,
    qual_parent_cohabitation: null,
    qual_parent_region: null,
    qual_university: null,
    qual_enrollment_status: null,
    qual_school_location: null,
    qual_school_category: null,
    qual_academic_year: null,
    apply_method: contest.apply_method,
    required_documents: contest.required_documents,
    document_files: contest.document_files ?? [],
    contact: contest.contact,
    selection_note: contest.selection_note,
    original_notice_image_url: contest.original_notice_image_url,
    original_notice_image_urls: contest.original_notice_image_urls,
    original_notice_text: contest.original_notice_text,
    note: contest.note,
    is_advertisement: false,
    ad_job_role: null,
    ad_required_skills: null,
    ad_location: null,
  };
}

export function scholarshipRowToDetail(row: ScholarshipRow): ScholarshipDetail {
  return {
    id: row.id,
    name: row.name,
    organization: row.organization,
    institution_type: row.institution_type,
    apply_url: row.apply_url,
    homepage_url: row.homepage_url,
    support_types: row.support_types ?? [],
    apply_start_date: row.apply_start_date,
    apply_end_date: row.apply_end_date,
    selection_count: row.selection_count,
    announcement_date: row.announcement_date,
    can_overlap: row.can_overlap,
    qual_gpa_min: row.qual_gpa_min,
    qual_gpa_last_semester_min: row.qual_gpa_last_semester_min,
    qual_last_semester_earned_credits_min: row.qual_last_semester_earned_credits_min,
    qual_income_level_max: row.qual_income_level_max,
    qual_income_level_min: row.qual_income_level_min,
    qual_household_size_max: row.qual_household_size_max,
    qual_gender: row.qual_gender,
    qual_age_min: row.qual_age_min,
    qual_age_max: row.qual_age_max,
    qual_region: row.qual_region,
    qual_major: row.qual_major,
    qual_special_info: row.qual_special_info,
    qual_extra_requirements: row.qual_extra_requirements,
    qual_parent_occupation: row.qual_parent_occupation,
    qual_military_status: row.qual_military_status,
    qual_nationality: row.qual_nationality,
    qual_admission_type: row.qual_admission_type,
    qual_parent_cohabitation: row.qual_parent_cohabitation,
    qual_parent_region: row.qual_parent_region,
    qual_university: row.qual_university,
    qual_enrollment_status: row.qual_enrollment_status,
    qual_school_location: row.qual_school_location,
    qual_school_category: row.qual_school_category,
    qual_academic_year: row.qual_academic_year,
    apply_method: row.apply_method,
    required_documents: row.required_documents,
    document_files: null,
    contact: row.contact,
    selection_note: row.selection_note,
    original_notice_image_url: row.original_notice_image_url,
    original_notice_image_urls: row.original_notice_image_urls,
    original_notice_text: row.original_notice_text,
    note: row.note,
    is_advertisement: row.is_advertisement ?? false,
    ad_job_role: row.ad_job_role,
    ad_required_skills: row.ad_required_skills,
    ad_location: row.ad_location,
  };
}

export function announcementKindLabel(kind: AnnouncementKind): string {
  if (kind === "scholarship") return "장학금";
  return contentKindLabel(kind);
}

export function announcementHref(kind: AnnouncementKind, id: number): string {
  return contentKindHref(kind, id);
}

export function isAnnouncementKind(value: string): value is AnnouncementKind {
  return (
    value === "scholarship" ||
    value === "contest" ||
    value === "education" ||
    value === "activity"
  );
}
