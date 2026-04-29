"use client";

import { daysUntilApplyDeadlineKorea, isAlwaysOpenRecruitment } from "@/lib/scholarship-dates";

export type ScholarshipDetail = {
  id: number;
  name: string;
  organization: string;
  institution_type: string;
  apply_url: string;
  homepage_url: string | null;
  support_types: string[];
  support_amount: number;
  apply_start_date: string | null;
  apply_end_date: string;
  selection_count: number | null;
  announcement_date: string | null;
  can_overlap: boolean | null;
  qual_gpa_min: number | null;
  qual_gpa_last_semester_min: number | null;
  qual_income_level_max: number | null;
  qual_income_level_min: number | null;
  qual_gender: string | null;
  qual_age_min: number | null;
  qual_age_max: number | null;
  qual_region: string[] | null;
  qual_major: string[] | null;
  qual_special_info: string[] | null;
  qual_nationality: string | null;
  qual_university: string[] | null;
  qual_enrollment_status: string[] | null;
  qual_school_location: string[] | null;
  qual_school_category: string[] | null;
  qual_academic_year: number[] | null;
  qual_min_academic_year: number | null;
  qual_min_academic_semester: number | null;
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
};

function hasQualifications(s: ScholarshipDetail): boolean {
  return !!(
    s.qual_gpa_min ||
    s.qual_gpa_last_semester_min ||
    s.qual_income_level_max ||
    s.qual_gender ||
    s.qual_age_min ||
    s.qual_age_max ||
    (s.qual_region && s.qual_region.length > 0) ||
    (s.qual_major && s.qual_major.length > 0) ||
    (s.qual_special_info && s.qual_special_info.length > 0) ||
    (s.qual_university && s.qual_university.length > 0) ||
    (s.qual_enrollment_status && s.qual_enrollment_status.length > 0) ||
    (s.qual_school_location && s.qual_school_location.length > 0) ||
    (s.qual_school_category && s.qual_school_category.length > 0) ||
    (s.qual_academic_year && s.qual_academic_year.length > 0) ||
    s.qual_min_academic_year ||
    s.qual_nationality
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${y}.${m}.${d}`;
}

// ── 지원자격 섹션 ────────────────────────────────────────────────────
function QualSection({ s }: { s: ScholarshipDetail }) {
  if (!hasQualifications(s)) {
    return <p className="text-sm text-gray-400">자격 요건 정보가 없습니다.</p>;
  }

  const rows: { icon: string; label: string; value: string }[] = [];

  if (s.qual_age_min || s.qual_age_max) {
    const parts = [];
    if (s.qual_age_min) parts.push(`만 ${s.qual_age_min}세 이상`);
    if (s.qual_age_max) parts.push(`만 ${s.qual_age_max}세 이하`);
    rows.push({ icon: "👤", label: "연령", value: parts.join(" ~ ") });
  }
  if (s.qual_region && s.qual_region.length > 0) {
    rows.push({ icon: "📍", label: "지역", value: s.qual_region.join(", ") });
  }
  if (s.qual_university && s.qual_university.length > 0) {
    rows.push({ icon: "🏛️", label: "대상 대학교", value: s.qual_university.join(", ") });
  }
  if (s.qual_school_category && s.qual_school_category.length > 0) {
    rows.push({ icon: "🏫", label: "대학 유형", value: s.qual_school_category.join(", ") });
  }
  if (s.qual_school_location && s.qual_school_location.length > 0) {
    rows.push({ icon: "📍", label: "학교 소재지", value: s.qual_school_location.join(", ") });
  }
  if (s.qual_enrollment_status && s.qual_enrollment_status.length > 0) {
    rows.push({ icon: "🎓", label: "재학 상태", value: s.qual_enrollment_status.join(", ") });
  }
  if (s.qual_academic_year && s.qual_academic_year.length > 0) {
    rows.push({ icon: "📆", label: "학년", value: s.qual_academic_year.map((y) => `${y}학년`).join(", ") });
  }
  if (s.qual_min_academic_year) {
    const semester = s.qual_min_academic_semester ? ` ${s.qual_min_academic_semester}학기` : "";
    rows.push({
      icon: "📆",
      label: "최소 학년",
      value: `${s.qual_min_academic_year}학년${semester} 이상`,
    });
  }
  if (s.qual_major && s.qual_major.length > 0) {
    rows.push({ icon: "📚", label: "전공", value: s.qual_major.join(", ") });
  }
  if (s.qual_gpa_min) {
    rows.push({ icon: "📊", label: "학점 (누적)", value: `${s.qual_gpa_min} 이상` });
  }
  if (s.qual_gpa_last_semester_min) {
    rows.push({ icon: "📊", label: "학점 (직전)", value: `${s.qual_gpa_last_semester_min} 이상` });
  }
  if (s.qual_income_level_max) {
    rows.push({
      icon: "💳",
      label: "소득 분위",
      value: `${s.qual_income_level_min ?? 1} ~ ${s.qual_income_level_max}분위`,
    });
  }
  if (s.qual_gender) {
    rows.push({ icon: "👥", label: "성별", value: s.qual_gender });
  }
  if (s.qual_nationality) {
    rows.push({ icon: "🌏", label: "국적", value: s.qual_nationality });
  }
  if (s.qual_special_info && s.qual_special_info.length > 0) {
    rows.push({ icon: "✨", label: "기타 요건", value: s.qual_special_info.join(", ") });
  }

  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-base leading-none">{row.icon}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:gap-4">
            <span className="w-24 shrink-0 text-xs font-medium text-gray-400">{row.label}</span>
            <span className="text-sm text-gray-800">{row.value}</span>
          </div>
        </div>
      ))}
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

  const stages = collectSelectionStages(s);
  stages.forEach((st, i) => {
    rows.push({
      kind: "stage",
      key: `stage-${i}-${st.title}`,
      label: st.title,
      value: st.schedule,
      sortMs: parseLooseScheduleSortMs(st.schedule),
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
    return <p className="text-sm text-gray-400">일정 정보가 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      {deduped.map((row, idx) => (
        <div key={row.key} className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-center leading-none">
            <span className="text-xs font-bold text-gray-600">{idx + 1}</span>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="text-xs font-medium text-gray-500">{row.label}</span>
            <span
              className={`shrink-0 text-right text-sm ${
                row.kind === "milestone" && row.urgent
                  ? "font-semibold text-red-600"
                  : row.kind === "stage" && !row.value
                    ? "font-medium text-gray-400"
                    : "font-semibold text-gray-800"
              }`}
            >
              {row.kind === "milestone" ? (
                <>
                  {row.value}
                  {row.urgent && (
                    <span className="ml-1.5 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                      D-{daysLeft}
                    </span>
                  )}
                </>
              ) : row.value ? (
                row.value
              ) : (
                "일정별도"
              )}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 제출 서류 섹션 ────────────────────────────────────────────────────
function DocumentsSection({ s }: { s: ScholarshipDetail }) {
  const docs = s.required_documents ?? [];
  if (docs.length === 0) return <p className="text-sm text-gray-400">서류 정보가 없습니다.</p>;

  return (
    <div>
      <ol className="space-y-2">
        {docs.map((doc, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="flex h-5 w-7 shrink-0 items-center justify-center rounded bg-gray-100 text-[10px] font-bold text-gray-500">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-sm text-gray-800">{doc}</span>
          </li>
        ))}
      </ol>
      {s.homepage_url && (
        <a
          href={s.homepage_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
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
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                {i + 1}
              </span>
              <span className="pt-0.5 text-sm text-gray-800">{step}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-gray-400">신청 방법 정보가 없습니다.</p>
      )}
      <a
        href={s.apply_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-indigo-100 transition hover:bg-indigo-700"
      >
        신청하러 가기
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      </a>
    </div>
  );
}

// ── 원본 공고문 섹션 ─────────────────────────────────────────────────
function OriginalNoticeSection({ s }: { s: ScholarshipDetail }) {
  const imageUrls = Array.from(
    new Set([...(s.original_notice_image_urls ?? []), s.original_notice_image_url].filter(Boolean) as string[])
  ).map((url) => url.trim()).filter(Boolean);
  const text = s.original_notice_text?.trim();

  if (imageUrls.length === 0 && !text) return null;

  return (
    <section>
      <h3 className="mb-4 text-sm font-bold text-gray-900">원본 공고문</h3>
      <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
        {imageUrls.map((imageUrl, i) => (
          <div key={imageUrl} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={`${s.name} 원본 공고문 ${i + 1}`} className="w-full object-contain" />
          </div>
        ))}
        {text ? (
          <div className="whitespace-pre-wrap rounded-xl bg-white px-4 py-3 text-sm leading-6 text-gray-700">
            {text}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** 장학금 상세 본문: 탭 없이 한 페이지에 섹션 순서대로 표시 */
export default function ScholarshipTabs({ scholarship }: { scholarship: ScholarshipDetail }) {
  const s = scholarship;

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {hasQualifications(s) ? (
          <section>
            <h3 className="mb-4 text-sm font-bold text-gray-900">지원자격</h3>
            <QualSection s={s} />
          </section>
        ) : null}
        <section className={hasQualifications(s) ? "" : "md:col-span-2"}>
          <h3 className="mb-4 text-sm font-bold text-gray-900">주요 일정</h3>
          <ScheduleSection s={s} />
        </section>
      </div>

      <div className="border-t border-gray-100" />

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="mb-4 text-sm font-bold text-gray-900">제출 서류</h3>
          <DocumentsSection s={s} />
        </section>
        <section>
          <h3 className="mb-4 text-sm font-bold text-gray-900">신청 방법</h3>
          <ApplySection s={s} />
        </section>
      </div>

      <OriginalNoticeSection s={s} />
    </div>
  );
}
