import type { SpecItemType } from "@/lib/database.types";

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
};

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
    addLabel: "어학 성적 추가",
    emptyHint: "TOEIC, OPIc 등 어학 성적을 기록해 보세요.",
    orgLabel: "시험/주관사",
    hasPeriod: false,
  },
];

export const SPEC_ITEM_TYPES = SPEC_SECTIONS.map((s) => s.type);

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

export function formatSpecPeriod(item: SpecItem): string {
  const start = formatSpecMonth(item.start_date);
  if (!start) return "";
  if (item.is_current) return `${start} – 진행 중`;
  const end = formatSpecMonth(item.end_date);
  return end ? `${start} – ${end}` : start;
}
