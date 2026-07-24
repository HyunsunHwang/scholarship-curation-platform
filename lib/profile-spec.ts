import type { SpecItemType } from "@/lib/database.types";
import {
  normalizeArtifacts,
  type SpecArtifact,
} from "@/lib/profile-artifacts";
import { normalizeSkills, type SkillName } from "@/lib/skills";

/** 클라이언트에 내려주는 스펙 항목 (user_id 등 제외) */
export type SpecItem = {
  id: string;
  item_type: SpecItemType;
  title: string;
  organization: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  star_role: string | null;
  star_action: string | null;
  star_result: string | null;
  skills: SkillName[];
  artifacts: SpecArtifact[];
};

export function coerceSpecItem(row: {
  id: string;
  item_type: SpecItemType;
  title: string;
  organization: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  star_role: string | null;
  star_action: string | null;
  star_result: string | null;
  skills?: string[] | null;
  artifacts?: unknown;
}): SpecItem {
  return {
    ...row,
    skills: normalizeSkills(row.skills ?? null),
    artifacts: normalizeArtifacts(row.artifacts),
  };
}

// ── 통합 "경험" 섹션 ────────────────────────────────────────────────────────
// 경력·대외활동·교육·프로젝트·수상은 하나의 경험 폼(STAR)을 공유하고,
// 종류는 분류·추천에만 쓰인다. 입력 항목은 동일하다.

export type ExperienceKind = Extract<
  SpecItemType,
  "experience" | "activity" | "education" | "project" | "award"
>;

export type ExperienceKindDef = {
  type: ExperienceKind;
  label: string;
  /** "어디서" 입력 placeholder (종류마다 뉘앙스가 다름) */
  wherePlaceholder: string;
};

export const EXPERIENCE_KINDS: ExperienceKindDef[] = [
  { type: "experience", label: "경력", wherePlaceholder: "예: OO커머스 CX팀" },
  { type: "activity", label: "대외활동", wherePlaceholder: "예: OO 서포터즈 3기" },
  { type: "education", label: "교육", wherePlaceholder: "예: OO교육원·온라인 플랫폼" },
  { type: "project", label: "프로젝트", wherePlaceholder: "예: 캡스톤디자인 팀" },
  { type: "award", label: "수상", wherePlaceholder: "예: OO공모전 (주최 기관)" },
];

export const EXPERIENCE_TYPES = EXPERIENCE_KINDS.map((k) => k.type);

export function isExperienceType(value: SpecItemType): value is ExperienceKind {
  return (EXPERIENCE_TYPES as SpecItemType[]).includes(value);
}

export function experienceKindLabel(type: SpecItemType): string {
  return EXPERIENCE_KINDS.find((k) => k.type === type)?.label ?? type;
}

export type SpecSectionDef = {
  type: SpecItemType;
  label: string;
  /** 항목 추가 버튼/모달 제목 */
  addLabel: string;
  /** 빈 섹션 안내 문구 */
  emptyHint: string;
  /** organization 입력 라벨 (섹션마다 의미가 다름) */
  orgLabel: string;
  /** 기간 입력 여부 (자격증·어학은 취득일 하나만) */
  hasPeriod: boolean;
};

export const SPEC_SECTIONS: SpecSectionDef[] = [
  {
    type: "experience",
    label: "경력",
    addLabel: "경력 추가",
    emptyHint: "인턴, 아르바이트, 근무 경험을 기록해 보세요.",
    orgLabel: "회사/기관",
    hasPeriod: true,
  },
  {
    type: "activity",
    label: "대외활동",
    addLabel: "대외활동 추가",
    emptyHint: "동아리, 서포터즈, 봉사활동 경험을 기록해 보세요.",
    orgLabel: "단체/주최",
    hasPeriod: true,
  },
  {
    type: "project",
    label: "프로젝트",
    addLabel: "프로젝트 추가",
    emptyHint: "수업·개인·팀 프로젝트를 기록해 보세요.",
    orgLabel: "소속/팀",
    hasPeriod: true,
  },
  {
    type: "award",
    label: "수상",
    addLabel: "수상 추가",
    emptyHint: "공모전·대회 수상 이력을 기록해 보세요.",
    orgLabel: "수여 기관",
    hasPeriod: false,
  },
  {
    type: "certification",
    label: "자격증",
    addLabel: "자격증 추가",
    emptyHint: "취득한 자격증을 기록해 보세요.",
    orgLabel: "발급 기관",
    hasPeriod: false,
  },
  {
    type: "language",
    label: "어학",
    addLabel: "어학 추가",
    emptyHint: "구사 언어와 수준, 어학 성적을 기록해 보세요.",
    orgLabel: "구사 수준",
    hasPeriod: false,
  },
];

export const SPEC_ITEM_TYPES: SpecItemType[] = [
  ...SPEC_SECTIONS.map((s) => s.type),
  "education",
];

export function isSpecItemType(value: string): value is SpecItemType {
  return (SPEC_ITEM_TYPES as string[]).includes(value);
}

/** "2024-03-01" → "2024.03" */
export function formatSpecMonth(dateStr: string | null): string {
  if (!dateStr) return "";
  const [y, m] = dateStr.split("-");
  if (!y || !m) return dateStr;
  return `${y}.${m}`;
}

/**
 * "2024-03-15" → "2024.03.15".
 * 일이 01이면 월 단위 기록(기존 데이터 포함)으로 보고 "2024.03"으로 줄여 표시한다.
 */
export function formatSpecDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return formatSpecMonth(dateStr);
  const [, y, m, d] = match;
  return d === "01" ? `${y}.${m}` : `${y}.${m}.${d}`;
}

export function formatSpecPeriod(item: SpecItem): string {
  const start = formatSpecDate(item.start_date);
  if (!start) return "";
  if (item.is_current) return `${start} – 진행 중`;
  const end = formatSpecDate(item.end_date);
  return end ? `${start} – ${end}` : start;
}
