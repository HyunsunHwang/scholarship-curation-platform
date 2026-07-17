"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  daysUntilApplyDeadlineKorea,
  isAlwaysOpenRecruitment,
} from "@/lib/scholarship-dates";
import { isApplyPeriodStageTitle } from "@/lib/schedule-stages";
import type { AutoCheckState, QualMatchItem } from "@/lib/scholarship-qualification-match";
import {
  NOTICE_LIST_RE,
  listItemText,
  parseOriginalNoticeText,
} from "@/lib/original-notice-format";
import type { ContestDocumentFile } from "@/lib/database.types";

export type ScholarshipDetail = {
  id: number;
  name: string;
  organization: string;
  institution_type: string;
  apply_url: string;
  homepage_url: string | null;
  support_types: string[];
  apply_start_date: string | null;
  apply_end_date: string;
  selection_count: number | null;
  announcement_date: string | null;
  can_overlap: boolean | null;
  qual_gpa_min: number | null;
  qual_gpa_last_semester_min: number | null;
  qual_last_semester_earned_credits_min: number | null;
  qual_income_level_max: number | null;
  qual_income_level_min: number | null;
  qual_household_size_max: number | null;
  qual_gender: string | null;
  qual_age_min: number | null;
  qual_age_max: number | null;
  qual_region: string[] | null;
  qual_major: string[] | null;
  qual_special_info: string[] | null;
  qual_extra_requirements: string[] | null;
  qual_parent_occupation: string[] | null;
  qual_military_status: string | null;
  qual_nationality: string | null;
  qual_admission_type: string[] | null;
  qual_parent_cohabitation: string | null;
  qual_parent_region: string[] | null;
  qual_university: string[] | null;
  qual_enrollment_status: string[] | null;
  qual_school_location: string[] | null;
  qual_school_category: string[] | null;
  qual_academic_year: number[] | null;
  apply_method: string | null;
  required_documents: string[] | null;
  /** Downloadable application/guide files (contests) */
  document_files?: ContestDocumentFile[] | null;
  contact: string | null;
  selection_note: string | null;
  original_notice_image_url: string | null;
  original_notice_image_urls: string[] | null;
  original_notice_text: string | null;
  note: string | null;
  is_advertisement: boolean;
  ad_job_role: string | null;
  ad_required_skills: string[] | null;
  ad_location: string | null;
};

/** scholarship_selection_stages 조회 결과 (선발 단계 + 합격 이후 절차) */
export type SelectionStageDetail = {
  stage_order: number;
  title: string;
  phase: "selection" | "post_acceptance";
  schedule_date: string | null;
  schedule_text: string | null;
  note: string | null;
};

/** "지원 전 직접 확인" 대상: get_matched_scholarships가 필터링하지 않는(=자동 확인 불가) 자유 텍스트·참고 정보 */
function hasManualCheckItems(s: ScholarshipDetail): boolean {
  return !!(
    s.qual_last_semester_earned_credits_min ||
    s.qual_parent_cohabitation ||
    (s.qual_parent_region && s.qual_parent_region.length > 0) ||
    (s.qual_extra_requirements && s.qual_extra_requirements.length > 0)
  );
}

function buildManualCheckItems(s: ScholarshipDetail): string[] {
  const items: string[] = [];
  if (s.qual_last_semester_earned_credits_min) {
    items.push(`직전학기 이수학점 ${s.qual_last_semester_earned_credits_min}학점 이상`);
  }
  if (s.qual_parent_cohabitation) {
    items.push(`부모 동거 여부: ${s.qual_parent_cohabitation}`);
  }
  if (s.qual_parent_region && s.qual_parent_region.length > 0) {
    items.push(`부모 거주 지역: ${s.qual_parent_region.join(", ")}`);
  }
  if (s.qual_extra_requirements) {
    items.push(...s.qual_extra_requirements);
  }
  return items;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${y}.${m}.${d}`;
}

/** 선발 단계 일정 칸: 순수 ISO 날짜만 한국어로 정리하고, 월·기간·추후 공지 등 자유 표기는 원문 유지 */
function formatScheduleDateDisplay(text: string | null): string {
  if (!text?.trim()) return "";
  const raw = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map((v) => parseInt(v, 10));
    return `${y}년 ${m}월 ${d}일`;
  }
  const ymdHead = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdHead && (raw === ymdHead[0] || raw.startsWith(`${ymdHead[0]}T`))) {
    const y = parseInt(ymdHead[1], 10);
    const m = parseInt(ymdHead[2], 10);
    const d = parseInt(ymdHead[3], 10);
    return `${y}년 ${m}월 ${d}일`;
  }
  return raw;
}

// ── 내 프로필 자동 확인 섹션 ─────────────────────────────────────────
/** 라벨 없이도 자연스럽게 읽히도록 일부 항목만 살짝 다듬고, 나머지는 값 그대로 노출 */
function describeQualMatchValue(item: QualMatchItem): string {
  if (item.key === "nationality") {
    return item.value === "내국인" ? "대한민국 국적" : item.value;
  }
  return item.value;
}

function AutoCheckItem({ item }: { item: QualMatchItem }) {
  const text = describeQualMatchValue(item);
  if (item.satisfied) {
    return (
      <li className="flex items-start gap-2.5">
        <svg
          className="mt-0.5 h-4 w-4 shrink-0 text-ink/55"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        <span className="wrap-break-word text-sm leading-6 text-ink/80">{text}</span>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-2.5">
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-ink/25"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      <span className="wrap-break-word text-sm leading-6 text-ink/35 line-through decoration-ink/20">
        {text}
      </span>
    </li>
  );
}

type AutoCheckSectionState = Extract<AutoCheckState, { kind: "guest" } | { kind: "ready" }>;

function AutoCheckSection({ autoCheck }: { autoCheck: AutoCheckSectionState }) {
  if (autoCheck.kind === "guest") {
    return (
      <Link
        href={autoCheck.ctaHref}
        className="group flex items-center gap-1.5 text-sm font-medium text-ink/60 transition hover:text-brand"
      >
        로그인하고 내 프로필로 자동 확인하기
        <svg
          className="h-3.5 w-3.5 shrink-0 transition group-hover:translate-x-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </Link>
    );
  }

  return (
    <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {autoCheck.items.map((item) => (
        <AutoCheckItem key={item.key} item={item} />
      ))}
    </ul>
  );
}

// ── 지원 전 직접 확인 섹션 ────────────────────────────────────────────
function ManualCheckSection({ items }: { items: string[] }) {
  return (
    <div>
      <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink/30" />
            <span className="wrap-break-word text-sm leading-6 text-ink/80">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 순수 서류심사 단계만 숨김 (면접·복합 전형 등은 유지) */
function isDocumentScreeningStageTitle(title: string): boolean {
  const c = title.replace(/\s+/g, "");
  if (c === "서류심사") return true;
  return /^(\d+차|제\d+차)서류심사$/.test(c);
}

type CollectedStage = {
  title: string;
  schedule: string | null;
  phase: "selection" | "post_acceptance";
  note: string | null;
};

/** DB의 stage_order 순서를 유지하며 순수 서류심사 단계만 걸러낸다 */
function collectSelectionStages(stages: SelectionStageDetail[]): CollectedStage[] {
  return [...stages]
    .sort((a, b) => a.stage_order - b.stage_order)
    .filter((st) => st.title.trim() && !isDocumentScreeningStageTitle(st.title))
    .map((st) => ({
      title: st.title.trim(),
      schedule: st.schedule_text?.trim() ? st.schedule_text.trim() : null,
      phase: st.phase,
      note: st.note?.trim() ? st.note.trim() : null,
    }));
}

function parseYYYYMMDDToUtcMs(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const part = dateStr.split("T")[0];
  const m = part.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (!y || !mo || !d) return null;
  return Date.UTC(y, mo - 1, d);
}

/**
 * 단계 일정 문구에서 정렬용 날짜만 추출 (실패 시 null → 맨 뒤).
 * 문구 맨 앞의 "YYYY-MM-DD" 또는 "YYYY.MM.DD"만 앵커 매칭한다.
 * (과거엔 공백/물결/하이픈으로 먼저 split했는데, 하이픈이 ISO 날짜 구분자와
 * 겹쳐 "2026-08-28" 같은 순수 날짜 문구까지 "2026"만 남아 파싱에 실패했다.)
 */
function parseLooseScheduleSortMs(text: string | null | undefined): number | null {
  if (!text?.trim()) return null;
  const trimmed = text.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Date.UTC(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
  const dot = trimmed.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (!dot) return null;
  return Date.UTC(parseInt(dot[1], 10), parseInt(dot[2], 10) - 1, parseInt(dot[3], 10));
}

type SortableScheduleRow =
  | {
      kind: "milestone";
      key: string;
      milestoneKind: "start" | "end" | "announce";
      label: string;
      value: string;
      urgent: boolean;
      sortMs: number;
    }
  | {
      kind: "stage";
      key: string;
      label: string;
      value: string | null;
      sortMs: number | null;
      sourceIndex: number;
      phase: "selection" | "post_acceptance";
      note: string | null;
    };

/** 선발 단계명이 공식 `announcement_date`와 겹치는 ‘발표’ 성격이면 타임라인에서 생략 */
function isResultAnnouncementStageTitle(title: string): boolean {
  const c = title.replace(/\s+/g, "");
  if (!c) return false;
  if (/면접|실기|서류전형/.test(c)) {
    if (!/최종|합격자|선정/.test(c)) return false;
  }
  return (
    /결과(발표|안내|공고)/.test(c) ||
    /최종(발표|선정|합격)/.test(c) ||
    /합격자(발표|공고|명단)?/.test(c) ||
    /선정(결과)?발표/.test(c)
  );
}

/** DB 일정 칸이 비어 있을 때: 발표 성격 단계는 공식 `announcement_date`로 보완 */
function resolveStageScheduleValue(
  s: ScholarshipDetail,
  title: string,
  raw: string | null,
): string | null {
  const t = raw?.trim();
  if (t) return t;
  if (isResultAnnouncementStageTitle(title) && s.announcement_date?.trim()) {
    return s.announcement_date.trim();
  }
  return null;
}

/** `announcement_date`와 선발 일정 문구가 같은 날을 가리키는지(파싱 실패·한글 표기 포함) */
function scheduleRefersToAnnouncementDay(text: string | null, announcementYmd: string | null): boolean {
  if (!text?.trim() || !announcementYmd) return false;
  const annMs = parseYYYYMMDDToUtcMs(announcementYmd);
  if (annMs === null) return false;
  if (parseLooseScheduleSortMs(text) === annMs) return true;
  const part = announcementYmd.split("T")[0];
  const m = part.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = m[1];
  const mo = m[2];
  const d = m[3];
  const moNum = String(parseInt(mo, 10));
  const dNum = String(parseInt(d, 10));
  const collapsed = text.replace(/\s+/g, "");
  if (collapsed.includes(`${y}-${mo}-${d}`) || collapsed.includes(`${y}.${mo}.${d}`) || collapsed.includes(`${y}/${mo}/${d}`))
    return true;
  if (collapsed.includes(`${moNum}월${dNum}일`)) return true;
  return false;
}

/** 동일 날짜의 발표 일정이 여러 줄(마일스톤 + 선발단계 등)이면 하나만 유지.
 *  일정 칸이 비어 있거나 날짜를 못 읽는 「최종 발표」 등은 공식 `결과 발표`와 동일로 본다 */
function dedupeRedundantResultAnnouncements(
  rows: SortableScheduleRow[],
  announcementYmd: string | null,
): SortableScheduleRow[] {
  const annMs = announcementYmd ? parseYYYYMMDDToUtcMs(announcementYmd) : null;

  const announcedDays = new Set<number>();
  for (const row of rows) {
    if (row.kind === "milestone" && row.milestoneKind === "announce") {
      announcedDays.add(row.sortMs);
    }
  }

  const out: SortableScheduleRow[] = [];
  for (const row of rows) {
    if (row.kind === "stage" && isResultAnnouncementStageTitle(row.label)) {
      if (annMs !== null && announcedDays.has(annMs) && row.sortMs === null) {
        continue;
      }
      const ms = scheduleRowSortMs(row);
      if (annMs !== null && announcedDays.has(annMs)) {
        const sameParsedDay = ms !== Number.POSITIVE_INFINITY && ms === annMs;
        const looseDay = scheduleRefersToAnnouncementDay(row.value, announcementYmd);
        if (sameParsedDay || looseDay) continue;
      }
      if (ms !== Number.POSITIVE_INFINITY) {
        if (announcedDays.has(ms)) continue;
        announcedDays.add(ms);
      }
    }
    out.push(row);
  }
  return out;
}

/** 날짜순 정렬된 줄에서 「결과 발표」 마일스톤만 항상 맨 아래로 */
function moveResultAnnouncementLast(rows: SortableScheduleRow[]): SortableScheduleRow[] {
  const announce = rows.filter((r) => r.kind === "milestone" && r.milestoneKind === "announce");
  const rest = rows.filter((r) => !(r.kind === "milestone" && r.milestoneKind === "announce"));
  return [...rest, ...announce];
}

function milestoneTieOrder(m: "start" | "end" | "announce"): number {
  return { start: 0, end: 1, announce: 2 }[m];
}

function scheduleRowSortMs(r: SortableScheduleRow): number {
  if (r.kind === "stage" && r.sortMs === null) return Number.POSITIVE_INFINITY;
  return r.sortMs as number;
}

/** 합격 이후(수혜·파견·오리엔테이션 등) 절차인지: 관리자가 지정한 phase 컬럼을 그대로 신뢰 */
function partitionScheduleRows(rows: SortableScheduleRow[]): {
  selection: SortableScheduleRow[];
  postAcceptance: SortableScheduleRow[];
} {
  const selection: SortableScheduleRow[] = [];
  const postAcceptance: SortableScheduleRow[] = [];
  for (const row of rows) {
    if (row.kind === "stage" && row.phase === "post_acceptance") {
      postAcceptance.push(row);
    } else {
      selection.push(row);
    }
  }
  return { selection, postAcceptance };
}

function getScheduleRowDateText(row: SortableScheduleRow, alwaysOpen: boolean): string | null {
  if (row.kind === "milestone") {
    if (row.milestoneKind === "end" && alwaysOpen) return "상시모집";
    return formatScheduleDateDisplay(row.value);
  }
  if (!row.value) return null;
  return formatScheduleDateDisplay(row.value);
}

type TimelinePhase = "selection" | "postAcceptance";

function ScheduleTimelineItem({
  row,
  phase,
  daysLeft,
  alwaysOpen,
}: {
  row: SortableScheduleRow;
  phase: TimelinePhase;
  daysLeft: number;
  alwaysOpen: boolean;
}) {
  const isSelection = phase === "selection";
  const dateText = getScheduleRowDateText(row, alwaysOpen);
  const isDeadlineMilestone = row.kind === "milestone" && row.milestoneKind === "end";
  const isDeadlineStage =
    row.kind === "stage" && /접수\s*마감|모집\s*마감|신청\s*마감/.test(row.label);
  const showDeadlineBadge =
    !alwaysOpen && daysLeft >= 0 && (isDeadlineMilestone || isDeadlineStage);
  const isUrgent = showDeadlineBadge && daysLeft <= 7;

  return (
    <div className="relative flex min-w-0 gap-4 pb-6 last:pb-0">
      <span
        className={`relative z-10 mt-1.5 shrink-0 rounded-full ${
          isSelection ? "h-[11px] w-[11px] bg-ink" : "h-[11px] w-[11px] border-2 border-ink/20 bg-white"
        }`}
      />
      <div className="min-w-0 flex-1">
        {dateText ? (
          <p
            className={`wrap-break-word text-xs leading-relaxed ${
              isUrgent
                ? "font-semibold text-brand"
                : isSelection
                  ? "font-medium text-ink/50"
                  : "font-medium text-ink/35"
            }`}
          >
            {dateText}
            {showDeadlineBadge && (
              <span className="ml-1 inline-flex items-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                D-{daysLeft}
              </span>
            )}
          </p>
        ) : (
          <p className={`text-xs font-medium ${isSelection ? "text-ink/40" : "text-ink/30"}`}>
            일정 별도 공지
          </p>
        )}
        <p
          className={`mt-0.5 wrap-break-word leading-snug ${
            isSelection ? "text-sm font-bold text-ink" : "text-sm font-medium text-ink/45"
          }`}
        >
          {row.label}
        </p>
      </div>
    </div>
  );
}

function ScheduleAfterAcceptanceDivider() {
  return (
    <div className="relative flex items-center gap-3 pb-4 pt-1">
      <span className="relative z-10 h-[7px] w-[7px] shrink-0 rounded-full bg-ink/20" />
      <span className="text-xs font-medium text-ink/35">합격 이후</span>
    </div>
  );
}

function ScheduleExpandToggle({
  expanded,
  hiddenCount,
  onToggle,
}: {
  expanded: boolean;
  hiddenCount: number;
  onToggle: () => void;
}) {
  return (
    <div className="relative flex min-w-0 items-center gap-4 pt-1">
      <span
        className="relative z-10 mt-0.5 flex h-[11px] w-[11px] shrink-0 items-center justify-center rounded-full border border-dashed border-ink/25 bg-white"
        aria-hidden
      >
        <span className="h-1 w-1 rounded-full bg-ink/25" />
      </span>
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-[#f7f5f2] px-2.5 py-1 text-[11px] font-semibold tracking-tight text-ink/55 transition-colors hover:border-ink/20 hover:bg-[#efece7] hover:text-ink/75"
        aria-expanded={expanded}
      >
        {expanded ? "일정 접기" : `이후 일정 ${hiddenCount}개 더보기`}
        <svg
          className={`h-3 w-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.25}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
    </div>
  );
}

type ScheduleTimelineEntry =
  | { type: "item"; key: string; row: SortableScheduleRow; phase: TimelinePhase }
  | { type: "divider"; key: string };

function isDeadlineScheduleRow(row: SortableScheduleRow): boolean {
  if (row.kind === "milestone" && row.milestoneKind === "end") return true;
  return row.kind === "stage" && /접수\s*마감|모집\s*마감|신청\s*마감/.test(row.label);
}

function buildScheduleTimelineEntries(
  selection: SortableScheduleRow[],
  postAcceptance: SortableScheduleRow[],
): ScheduleTimelineEntry[] {
  const entries: ScheduleTimelineEntry[] = selection.map((row) => ({
    type: "item",
    key: row.key,
    row,
    phase: "selection",
  }));
  if (postAcceptance.length > 0) {
    entries.push({ type: "divider", key: "after-acceptance-divider" });
    for (const row of postAcceptance) {
      entries.push({
        type: "item",
        key: row.key,
        row,
        phase: "postAcceptance",
      });
    }
  }
  return entries;
}

/** 접수 마감 항목 인덱스. 없으면 -1 */
function findDeadlineCutoffIndex(entries: ScheduleTimelineEntry[]): number {
  let cutoff = -1;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.type === "item" && isDeadlineScheduleRow(entry.row)) {
      cutoff = i;
    }
  }
  return cutoff;
}

// ── 주요 일정 (전 항목 날짜순 정렬 + 번호 통일) ─────────────────────────
function ScheduleSection({ s, selectionStages }: { s: ScholarshipDetail; selectionStages: SelectionStageDetail[] }) {
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const alwaysOpen = isAlwaysOpenRecruitment(s.apply_end_date);

  const daysLeft = daysUntilApplyDeadlineKorea(s.apply_end_date);
  const isUrgentDeadline = !alwaysOpen && daysLeft >= 0 && daysLeft <= 7;

  const rows: SortableScheduleRow[] = [];

  // 접수 시작/마감은 apply_* 마일스톤만 사용. stages의 접수·모집기간 항목은 중복이라 제외.
  const stages = collectSelectionStages(selectionStages).filter(
    (st) => !isApplyPeriodStageTitle(st.title),
  );

  if (s.apply_start_date) {
    const sortMs = parseYYYYMMDDToUtcMs(s.apply_start_date);
    if (sortMs !== null) {
      rows.push({
        kind: "milestone",
        key: "start",
        milestoneKind: "start",
        label: "접수 시작",
        value: formatDate(s.apply_start_date),
        urgent: false,
        sortMs,
      });
    }
  }

  {
    const endSortMs = parseYYYYMMDDToUtcMs(s.apply_end_date);
    if (endSortMs !== null) {
      rows.push({
        kind: "milestone",
        key: "end",
        milestoneKind: "end",
        label: "접수 마감",
        value: alwaysOpen ? "상시모집" : formatDate(s.apply_end_date),
        urgent: isUrgentDeadline,
        sortMs: endSortMs,
      });
    }
  }

  if (s.announcement_date) {
    const sortMs = parseYYYYMMDDToUtcMs(s.announcement_date);
    if (sortMs !== null) {
      rows.push({
        kind: "milestone",
        key: "announce",
        milestoneKind: "announce",
        label: "결과 발표",
        value: formatDate(s.announcement_date),
        urgent: false,
        sortMs,
      });
    }
  }

  stages.forEach((st, i) => {
    const resolved = resolveStageScheduleValue(s, st.title, st.schedule);
    rows.push({
      kind: "stage",
      key: `stage-${i}-${st.title}`,
      label: st.title,
      value: resolved,
      sortMs: parseLooseScheduleSortMs(resolved),
      sourceIndex: i,
      phase: st.phase,
      note: st.note,
    });
  });

  rows.sort((a, b) => {
    const ma = scheduleRowSortMs(a);
    const mb = scheduleRowSortMs(b);
    if (ma !== mb) return ma - mb;
    const ra = a.kind === "milestone" ? milestoneTieOrder(a.milestoneKind) : 3 + a.sourceIndex;
    const rb = b.kind === "milestone" ? milestoneTieOrder(b.milestoneKind) : 3 + b.sourceIndex;
    return ra - rb;
  });

  const deduped = moveResultAnnouncementLast(
    dedupeRedundantResultAnnouncements(rows, s.announcement_date),
  );

  if (deduped.length === 0) {
    return <p className="text-sm text-ink/45">일정 정보가 없습니다.</p>;
  }

  const { selection, postAcceptance } = partitionScheduleRows(deduped);
  const entries = buildScheduleTimelineEntries(selection, postAcceptance);
  const deadlineCutoff = findDeadlineCutoffIndex(entries);
  const hasMoreAfterDeadline =
    deadlineCutoff >= 0 && deadlineCutoff < entries.length - 1;
  const hiddenCount = hasMoreAfterDeadline
    ? entries
        .slice(deadlineCutoff + 1)
        .filter((entry) => entry.type === "item").length
    : 0;
  const visibleEntries =
    scheduleExpanded || !hasMoreAfterDeadline
      ? entries
      : entries.slice(0, deadlineCutoff + 1);

  return (
    <div className="relative">
      <span className="absolute left-[5px] top-2 bottom-2 w-px bg-gray-200" />
      <div>
        {visibleEntries.map((entry) =>
          entry.type === "divider" ? (
            <ScheduleAfterAcceptanceDivider key={entry.key} />
          ) : (
            <ScheduleTimelineItem
              key={entry.key}
              row={entry.row}
              phase={entry.phase}
              daysLeft={daysLeft}
              alwaysOpen={alwaysOpen}
            />
          ),
        )}
        {hasMoreAfterDeadline && (
          <ScheduleExpandToggle
            expanded={scheduleExpanded}
            hiddenCount={hiddenCount}
            onToggle={() => setScheduleExpanded((prev) => !prev)}
          />
        )}
      </div>
    </div>
  );
}

// ── 제출 서류 섹션 ────────────────────────────────────────────────────
function DocumentsSection({ s }: { s: ScholarshipDetail }) {
  const files = (s.document_files ?? []).filter((f) => f?.url);
  const docs = s.required_documents ?? [];

  if (files.length === 0 && docs.length === 0) {
    return <p className="text-sm text-ink/45">서류 정보가 없습니다.</p>;
  }

  return (
    <div>
      {files.length > 0 ? (
        <ul className="space-y-2.5">
          {files.map((file: ContestDocumentFile, i) => (
            <li key={`${file.url}-${i}`} className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                {i + 1}
              </span>
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                download={file.name || undefined}
                className="wrap-break-word text-sm font-medium leading-6 text-brand hover:underline"
              >
                {file.name || `서류 ${i + 1}`}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <ol className="space-y-2.5">
          {docs.map((doc, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                {i + 1}
              </span>
              <span className="wrap-break-word text-sm leading-6 text-ink">{doc}</span>
            </li>
          ))}
        </ol>
      )}
      {files.length === 0 && s.homepage_url && (
        <a
          href={s.homepage_url}
          target="_blank"
          rel="noopener noreferrer"
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#f1d6ba] bg-[#fff2df] px-4 py-2.5 text-xs font-semibold text-ink transition hover:bg-[#ffe9cd] sm:w-auto"
        >
          서류 양식 다운로드
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        </a>
      )}
    </div>
  );
}

// ── 신청 방법 섹션 ────────────────────────────────────────────────────
function ApplySection({ s }: { s: ScholarshipDetail }) {
  const steps = s.apply_method ? s.apply_method.split(/[,\n·•]/).map((p) => p.trim()).filter(Boolean) : [];

  return (
    <div>
      {steps.length > 0 ? (
        <ol className="space-y-2.5">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                {i + 1}
              </span>
              <span className="wrap-break-word text-sm leading-6 text-ink">{step}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink/45">신청 방법 정보가 없습니다.</p>
      )}
      <a
        href={s.apply_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-brand/20 transition hover:bg-[#e82a2a] sm:w-auto"
      >
        신청하러 가기
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      </a>
    </div>
  );
}

function AdSkillsSection({ s }: { s: ScholarshipDetail }) {
  const skills = s.ad_required_skills ?? [];
  if (skills.length === 0) return <p className="text-sm text-ink/45">요구 역량 정보가 없습니다.</p>;

  return (
    <ul className="space-y-2.5">
      {skills.map((skill, i) => (
        <li key={`${skill}-${i}`} className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-base leading-none">✅</span>
          <span className="wrap-break-word text-sm leading-6 text-ink">{skill}</span>
        </li>
      ))}
    </ul>
  );
}

function AdLocationSection({ s }: { s: ScholarshipDetail }) {
  if (!s.ad_location?.trim()) return <p className="text-sm text-ink/45">소재지 정보가 없습니다.</p>;
  return <p className="wrap-break-word text-sm leading-6 text-ink">{s.ad_location}</p>;
}

// ── 원문 공고문 섹션 ─────────────────────────────────────────────────
function NoticeSectionBody({ body }: { body: string }) {
  if (!body) return null;

  const lines = body.split("\n");
  const nodes: ReactNode[] = [];
  let key = 0;

  for (let idx = 0; idx < lines.length; ) {
    const trimmed = lines[idx].trim();
    if (!trimmed) {
      idx += 1;
      continue;
    }

    const listMatch = trimmed.match(NOTICE_LIST_RE);
    if (listMatch) {
      const items: string[] = [];
      while (idx < lines.length) {
        const t = lines[idx].trim();
        if (!t) break;
        const m = t.match(NOTICE_LIST_RE);
        if (!m) break;
        items.push(listItemText(m));
        idx += 1;
      }
      nodes.push(
        <ul key={key++} className="mt-2 space-y-1.5">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2.5">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink/30" />
              <span className="wrap-break-word text-sm leading-6 text-ink/75">{item}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^※/.test(trimmed)) {
      nodes.push(
        <p key={key++} className="mt-2 wrap-break-word text-xs leading-relaxed text-ink/50">
          {trimmed}
        </p>
      );
      idx += 1;
      continue;
    }

    const paraLines: string[] = [trimmed];
    idx += 1;
    while (idx < lines.length) {
      const t = lines[idx].trim();
      if (!t || NOTICE_LIST_RE.test(t) || /^※/.test(t)) break;
      paraLines.push(t);
      idx += 1;
    }
    nodes.push(
      <p key={key++} className="mt-1.5 wrap-break-word whitespace-pre-wrap text-sm leading-6 text-ink/75">
        {paraLines.join("\n")}
      </p>
    );
  }

  return <div className="mt-1">{nodes}</div>;
}

function OriginalNoticeText({ text }: { text: string }) {
  const blocks = parseOriginalNoticeText(text);

  if (blocks.length === 0) {
    return (
      <p className="wrap-break-word whitespace-pre-wrap text-sm leading-7 text-ink/75">{text}</p>
    );
  }

  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        if (block.kind === "title") {
          return (
            <p
              key={i}
              className="wrap-break-word text-[15px] font-bold leading-snug tracking-tight text-ink"
            >
              {block.text}
            </p>
          );
        }
        if (block.kind === "note") {
          return (
            <p
              key={i}
              className="wrap-break-word border-l-2 border-brand/40 pl-3 text-sm font-medium leading-6 text-ink/70"
            >
              {block.text}
            </p>
          );
        }
        if (block.kind === "section") {
          return (
            <div key={i} className="border-t border-gray-100 pt-5 first:border-t-0 first:pt-0">
              <p className="text-sm font-bold text-ink">{block.label}</p>
              <NoticeSectionBody body={block.body} />
            </div>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={i} className="space-y-1.5">
              {block.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2.5">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink/30" />
                  <span className="wrap-break-word text-sm leading-6 text-ink/75">{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="wrap-break-word whitespace-pre-wrap text-sm leading-7 text-ink/75">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

function OriginalNoticeSection({ s }: { s: ScholarshipDetail }) {
  const imageUrls = Array.from(
    new Set([...(s.original_notice_image_urls ?? []), s.original_notice_image_url].filter(Boolean) as string[])
  ).map((url) => url.trim()).filter(Boolean);
  const text = s.original_notice_text?.trim();

  if (imageUrls.length === 0 && !text) return null;

  return (
    <div className="space-y-6">
      {imageUrls.map((imageUrl, i) => (
        <div key={imageUrl} className="overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`${s.name} 원문 공고문 ${i + 1}`}
            className="w-full object-contain"
          />
        </div>
      ))}
      {text ? <OriginalNoticeText text={text} /> : null}
    </div>
  );
}

type SectionIconName =
  | "profile"
  | "search"
  | "calendar"
  | "document"
  | "checklist"
  | "newspaper"
  | "briefcase"
  | "mapPin";

const SECTION_ICON_PATHS: Record<SectionIconName, string> = {
  profile:
    "M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z",
  search: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  calendar:
    "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  document:
    "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12h-9m9-3.75h-9m3.75-9H6.75A2.25 2.25 0 004.5 6.75v10.5A2.25 2.25 0 006.75 19.5h9a2.25 2.25 0 002.25-2.25v-4.5",
  checklist:
    "M9 12.75l1.5 1.5 3-3.75M3 12a9 9 0 1018 0 9 9 0 00-18 0z",
  newspaper:
    "M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z",
  briefcase:
    "M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42a2.203 2.203 0 01-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0",
  mapPin:
    "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z",
};

function SectionIcon({ name }: { name: SectionIconName }) {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-ink/40"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={SECTION_ICON_PATHS[name]} />
    </svg>
  );
}

export default function ScholarshipTabs({
  scholarship,
  selectionStages,
  autoCheck,
  hideQualificationSections = false,
  layout = "netflix",
  preScheduleSlot = null,
}: {
  scholarship: ScholarshipDetail;
  selectionStages: SelectionStageDetail[];
  autoCheck: AutoCheckState;
  /** 공모전 등: 프로필 자격·직접 확인 섹션 숨김 */
  hideQualificationSections?: boolean;
  /**
   * netflix: 일정 이전 | 일정 | 원문 이후를 2열+전체폭
   * scheduleOnly / preOnly / postOnly: 모달 등에서 열을 직접 조립할 때
   */
  layout?: "stack" | "netflix" | "scheduleOnly" | "preOnly" | "postOnly";
  /** 일정 이전 열 상단(혜택 하이라이트 등) */
  preScheduleSlot?: ReactNode;
}) {
  const s = scholarship;
  const isAdvertisement = s.is_advertisement === true;
  const manualCheckItems =
    !hideQualificationSections && !isAdvertisement && hasManualCheckItems(s)
      ? buildManualCheckItems(s)
      : [];

  const sectionTitle = (label: string, icon: SectionIconName, right?: ReactNode) => (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink">
        <SectionIcon name={icon} />
        {label}
      </h3>
      {right}
    </div>
  );

  const preSchedule = (
    <>
      {preScheduleSlot}
      {isAdvertisement ? (
        <section className="py-7 first:pt-0">
          {sectionTitle("요구 역량", "briefcase")}
          <AdSkillsSection s={s} />
        </section>
      ) : (
        !hideQualificationSections && (
          <>
            {autoCheck.kind !== "none" && (
              <section className="py-7 first:pt-0">
                {sectionTitle(
                  "내 프로필로 확인된 자격",
                  "profile",
                  autoCheck.kind === "ready" && autoCheck.items.length > 0 ? (
                    <span className="shrink-0 text-xs font-semibold text-ink/40">
                      {autoCheck.items.filter((item) => item.satisfied).length}/{autoCheck.items.length}개 충족
                    </span>
                  ) : undefined
                )}
                <AutoCheckSection autoCheck={autoCheck} />
              </section>
            )}
            {manualCheckItems.length > 0 && (
              <section className="py-7 first:pt-0">
                {sectionTitle("지원 전 직접 확인하세요", "search")}
                <ManualCheckSection items={manualCheckItems} />
              </section>
            )}
          </>
        )
      )}
    </>
  );

  const schedule = (
    <section className="py-7 first:pt-0">
      {sectionTitle("주요 일정", "calendar")}
      <ScheduleSection s={s} selectionStages={selectionStages} />
    </section>
  );

  const postSchedule = (
    <>
      {isAdvertisement ? (
        <section className="py-7">
          {sectionTitle("소재지", "mapPin")}
          <AdLocationSection s={s} />
        </section>
      ) : null}

      {(s.original_notice_image_urls?.length ||
        s.original_notice_image_url ||
        s.original_notice_text?.trim()) && (
        <section className="w-full overflow-x-hidden py-7">
          {sectionTitle("원문 공고문", "newspaper")}
          <OriginalNoticeSection s={s} />
        </section>
      )}

      {isAdvertisement ? (
        <section className="py-7">
          {sectionTitle("지원 방법", "checklist")}
          <ApplySection s={s} />
        </section>
      ) : (
        <>
          <section className="py-7">
            {sectionTitle("제출 서류", "document")}
            <DocumentsSection s={s} />
          </section>
          <section className="py-7">
            {sectionTitle(hideQualificationSections ? "지원 방법" : "선발 방법", "checklist")}
            <ApplySection s={s} />
          </section>
        </>
      )}
    </>
  );

  if (layout === "scheduleOnly") {
    return <div className="w-full overflow-x-hidden">{schedule}</div>;
  }
  if (layout === "preOnly") {
    return (
      <div className="w-full divide-y divide-gray-100 overflow-x-hidden">
        {preSchedule}
      </div>
    );
  }
  if (layout === "postOnly") {
    return (
      <div className="mt-6 w-full divide-y divide-gray-100 overflow-x-hidden border-t border-gray-100">
        {postSchedule}
      </div>
    );
  }

  if (layout === "netflix") {
    // 상세 페이지: 왼쪽(넓게) 혜택·자격 / 오른쪽(좁게) 주요일정
    return (
      <div className="mt-8 w-full overflow-x-hidden">
        <div className="grid grid-cols-1 items-start gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,240px)] md:gap-8 md:divide-x md:divide-gray-100">
          <div className="min-w-0 divide-y divide-gray-100 md:pr-8">
            {preSchedule}
          </div>
          <div className="min-w-0 divide-y divide-gray-100 border-t border-gray-100 md:border-t-0 md:pl-6">
            {schedule}
          </div>
        </div>
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {postSchedule}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 w-full divide-y divide-gray-100 overflow-x-hidden">
      {preSchedule}
      {schedule}
      {postSchedule}
    </div>
  );
}
