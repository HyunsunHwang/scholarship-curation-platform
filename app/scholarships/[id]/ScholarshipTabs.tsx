"use client";

import Link from "next/link";
import {
  daysUntilApplyDeadlineKorea,
  isAlwaysOpenRecruitment,
} from "@/lib/scholarship-dates";
import type { AutoCheckState, QualMatchItem } from "@/lib/scholarship-qualification-match";

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
  contact: string | null;
  selection_stages: number;
  selection_stage_1: string | null;
  selection_stage_2: string | null;
  selection_stage_3: string | null;
  selection_stage_4: string | null;
  selection_stage_5: string | null;
  selection_stage_1_schedule: string | null;
  selection_stage_2_schedule: string | null;
  selection_stage_3_schedule: string | null;
  selection_stage_4_schedule: string | null;
  selection_stage_5_schedule: string | null;
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

/** 선발 단계 일정 칸: 순수 ISO 날짜·타임스탬프 앞부분이면 마일스톤과 같은 표기로 통일, 그 외는 원문 유지 */
function formatScheduleCell(text: string | null): string {
  if (!text?.trim()) return "";
  const raw = text.trim();
  const ymdHead = raw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (ymdHead && (raw === ymdHead || raw.startsWith(`${ymdHead}T`))) return formatDate(ymdHead);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatDate(raw);
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

function AutoCheckChip({ item }: { item: QualMatchItem }) {
  const text = describeQualMatchValue(item);
  if (item.satisfied) {
    return (
      <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        <span className="wrap-break-word">{text}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-ink/40">
      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      <span className="wrap-break-word">{text}</span>
    </span>
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
    <div className="flex flex-wrap gap-2">
      {autoCheck.items.map((item) => (
        <AutoCheckChip key={item.key} item={item} />
      ))}
    </div>
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

function collectSelectionStages(s: ScholarshipDetail): { title: string; schedule: string | null }[] {
  const raw: { title: string; schedule: string | null }[] = [];
  for (let n = 1; n <= 5; n++) {
    const title = s[`selection_stage_${n}` as keyof ScholarshipDetail] as string | null;
    if (!title?.trim()) continue;
    if (isDocumentScreeningStageTitle(title)) continue;
    const schedule = s[`selection_stage_${n}_schedule` as keyof ScholarshipDetail] as string | null;
    raw.push({
      title: title.trim(),
      schedule: schedule?.trim() ? schedule.trim() : null,
    });
  }
  return raw;
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

/** 단계 일정 문구에서 정렬용 날짜만 추출 (실패 시 null → 맨 뒤) */
function parseLooseScheduleSortMs(text: string | null | undefined): number | null {
  if (!text?.trim()) return null;
  const head = text.trim().split(/[\s~–—\-]+/)[0];
  const iso = parseYYYYMMDDToUtcMs(head);
  if (iso !== null) return iso;
  const dot = head.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
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

// ── 주요 일정 (전 항목 날짜순 정렬 + 번호 통일) ─────────────────────────
function ScheduleSection({ s }: { s: ScholarshipDetail }) {
  const alwaysOpen = isAlwaysOpenRecruitment(s.apply_end_date);

  const daysLeft = daysUntilApplyDeadlineKorea(s.apply_end_date);
  const isUrgent = !alwaysOpen && daysLeft >= 0 && daysLeft <= 7;

  const rows: SortableScheduleRow[] = [];

  const stages = collectSelectionStages(s);
  const hasStages = stages.length > 0;

  // 전형 단계가 있으면 접수 시작/마감은 단계 일정과 중복되므로 제외하고,
  // 전형 단계가 없을 때만 접수 시작/마감을 표시한다.
  if (!hasStages && s.apply_start_date) {
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

  if (!hasStages) {
    const endSortMs = parseYYYYMMDDToUtcMs(s.apply_end_date);
    if (endSortMs !== null) {
      rows.push({
        kind: "milestone",
        key: "end",
        milestoneKind: "end",
        label: "접수 마감",
        value: alwaysOpen ? "상시모집" : formatDate(s.apply_end_date),
        urgent: isUrgent,
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

  return (
    <div>
      {deduped.map((row, idx) => (
        <div key={row.key} className="relative flex min-w-0 gap-4 pb-6 last:pb-0">
          {idx !== deduped.length - 1 && (
            <span className="absolute left-[5px] top-3 bottom-0 w-px bg-gray-200" />
          )}
          <span className="relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-brand bg-white" />
          <div className="min-w-0 flex-1">
            <p
              className={`wrap-break-word text-xs font-semibold ${
                row.kind === "milestone" && row.urgent
                  ? "text-brand"
                  : row.kind === "stage" && !row.value
                    ? "text-ink/40"
                    : "text-ink/50"
              }`}
            >
              {row.kind === "milestone" ? (
                <>
                  {row.value}
                  {row.urgent && (
                    <span className="ml-1 inline-flex items-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                      D-{daysLeft}
                    </span>
                  )}
                </>
              ) : row.value ? (
                formatScheduleCell(row.value)
              ) : (
                "일정 별도 공지"
              )}
            </p>
            <p className="mt-0.5 wrap-break-word text-sm font-bold text-ink">{row.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 제출 서류 섹션 ────────────────────────────────────────────────────
function DocumentsSection({ s }: { s: ScholarshipDetail }) {
  const docs = s.required_documents ?? [];
  if (docs.length === 0) return <p className="text-sm text-ink/45">서류 정보가 없습니다.</p>;

  return (
    <div>
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
      {s.homepage_url && (
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

// ── 원본 공고문 섹션 ─────────────────────────────────────────────────
function OriginalNoticeSection({ s }: { s: ScholarshipDetail }) {
  const imageUrls = Array.from(
    new Set([...(s.original_notice_image_urls ?? []), s.original_notice_image_url].filter(Boolean) as string[])
  ).map((url) => url.trim()).filter(Boolean);
  const text = s.original_notice_text?.trim();

  if (imageUrls.length === 0 && !text) return null;

  return (
    <div className="space-y-4 rounded-xl bg-gray-50 p-4">
      {imageUrls.map((imageUrl, i) => (
        <div key={imageUrl} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={`${s.name} 원본 공고문 ${i + 1}`} className="w-full object-contain" />
        </div>
      ))}
      {text ? (
        <div className="whitespace-pre-wrap break-all rounded-lg bg-white px-4 py-3 text-sm leading-6 text-ink/80">
          {text}
        </div>
      ) : null}
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

/** 장학금 상세 본문: 탭 없이 한 페이지에 섹션 순서대로 표시 */
export default function ScholarshipTabs({
  scholarship,
  autoCheck,
}: {
  scholarship: ScholarshipDetail;
  autoCheck: AutoCheckState;
}) {
  const s = scholarship;
  const isAdvertisement = s.is_advertisement === true;
  const manualCheckItems = !isAdvertisement && hasManualCheckItems(s) ? buildManualCheckItems(s) : [];

  const sectionTitle = (label: string, icon: SectionIconName, right?: React.ReactNode) => (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink">
        <SectionIcon name={icon} />
        {label}
      </h3>
      {right}
    </div>
  );

  return (
    <div className="mt-8 w-full divide-y divide-gray-100 overflow-x-hidden">
      {isAdvertisement ? (
        <section className="py-7 first:pt-0">
          {sectionTitle("요구 역량", "briefcase")}
          <AdSkillsSection s={s} />
        </section>
      ) : (
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
      )}

      <section className="py-7 first:pt-0">
        {sectionTitle("주요 일정", "calendar")}
        <ScheduleSection s={s} />
      </section>

      {isAdvertisement ? (
        <>
          <section className="py-7">
            {sectionTitle("소재지", "mapPin")}
            <AdLocationSection s={s} />
          </section>
          <section className="py-7">
            {sectionTitle("지원 방법", "checklist")}
            <ApplySection s={s} />
          </section>
        </>
      ) : (
        <>
          <section className="py-7">
            {sectionTitle("제출 서류", "document")}
            <DocumentsSection s={s} />
          </section>
          <section className="py-7">
            {sectionTitle("선발 방법", "checklist")}
            <ApplySection s={s} />
          </section>
        </>
      )}

      {(s.original_notice_image_urls?.length ||
        s.original_notice_image_url ||
        s.original_notice_text?.trim()) && (
        <section className="w-full overflow-x-hidden py-7">
          {sectionTitle("원본 공고문", "newspaper")}
          <OriginalNoticeSection s={s} />
        </section>
      )}
    </div>
  );
}
