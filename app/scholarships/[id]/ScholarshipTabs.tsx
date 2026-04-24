"use client";

import { useState } from "react";
import { formatApplyPeriodRange, isAlwaysOpenRecruitment } from "@/lib/scholarship-dates";

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
  selection_note: string | null;
  note: string | null;
};

type TabKey = "상세정보" | "지원자격" | "선발절차" | "제출서류" | "신청방법";

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
    (s.qual_enrollment_status && s.qual_enrollment_status.length > 0) ||
    (s.qual_school_location && s.qual_school_location.length > 0) ||
    (s.qual_school_category && s.qual_school_category.length > 0) ||
    (s.qual_academic_year && s.qual_academic_year.length > 0) ||
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

// ── 주요 일정 섹션 ────────────────────────────────────────────────────
function ScheduleSection({ s }: { s: ScholarshipDetail }) {
  const alwaysOpen = isAlwaysOpenRecruitment(s.apply_end_date);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(s.apply_end_date);
  const daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isUrgent = !alwaysOpen && daysLeft >= 0 && daysLeft <= 7;

  const items = [
    s.apply_start_date
      ? { icon: "📋", label: "접수 시작", value: formatDate(s.apply_start_date), urgent: false }
      : null,
    {
      icon: "⏰",
      label: "접수 마감",
      value: alwaysOpen ? "상시모집" : `${formatDate(s.apply_end_date)}`,
      urgent: isUrgent,
    },
    s.announcement_date
      ? { icon: "📣", label: "결과 발표", value: formatDate(s.announcement_date), urgent: false }
      : null,
  ].filter(Boolean) as { icon: string; label: string; value: string; urgent: boolean }[];

  if (items.length === 0) {
    return <p className="text-sm text-gray-400">일정 정보가 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-base">
            {item.icon}
          </div>
          <div className="flex flex-1 items-center justify-between gap-2">
            <span className="text-xs font-medium text-gray-500">{item.label}</span>
            <span className={`text-sm font-semibold ${item.urgent ? "text-red-600" : "text-gray-800"}`}>
              {item.value}
              {item.urgent && (
                <span className="ml-1.5 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                  D-{daysLeft}
                </span>
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

// ── 선발 절차 섹션 ────────────────────────────────────────────────────
function SelectionSection({ s }: { s: ScholarshipDetail }) {
  const stages = [1, 2, 3, 4, 5]
    .map((n) => (s as Record<string, unknown>)[`selection_stage_${n}`] as string | null)
    .filter(Boolean) as string[];

  if (stages.length === 0) return <p className="text-sm text-gray-400">선발 절차 정보가 없습니다.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {stages.map((stage, i) => (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && (
              <svg className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                {i + 1}
              </span>
              {stage}
            </span>
          </div>
        ))}
      </div>
      {s.selection_note && (
        <p className="mt-3 rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-500">{s.selection_note}</p>
      )}
    </div>
  );
}

// ── 유의사항 섹션 ────────────────────────────────────────────────────
function NoticeSection({ s }: { s: ScholarshipDetail }) {
  const items: string[] = [];
  if (s.can_overlap === false) items.push("타 장학금 수혜 시 중복 수혜가 불가합니다.");
  if (s.note) {
    s.note.split(/[,\n·•]/).map((p) => p.trim()).filter(Boolean).forEach((p) => items.push(p));
  }
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
      <p className="mb-3 text-sm font-bold text-amber-800">유의사항</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-amber-900">
            <span className="mt-0.5 shrink-0 text-amber-500">•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 탭 콘텐츠: 상세정보 ────────────────────────────────────────────────────
function DetailTab({ s }: { s: ScholarshipDetail }) {
  return (
    <div className="space-y-6">
      {/* 지원자격 + 주요 일정 */}
      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="mb-4 text-sm font-bold text-gray-900">지원자격</h3>
          <QualSection s={s} />
        </section>
        <section>
          <h3 className="mb-4 text-sm font-bold text-gray-900">주요 일정</h3>
          <ScheduleSection s={s} />
        </section>
      </div>

      <div className="border-t border-gray-100" />

      {/* 제출 서류 + 신청 방법 */}
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

      {/* 유의사항 */}
      <NoticeSection s={s} />
    </div>
  );
}

// ── 메인 탭 컴포넌트 ────────────────────────────────────────────────────
export default function ScholarshipTabs({ scholarship }: { scholarship: ScholarshipDetail }) {
  const s = scholarship;

  const allTabs: { key: TabKey; show: boolean }[] = [
    { key: "상세정보", show: true },
    { key: "지원자격", show: hasQualifications(s) },
    { key: "선발절차", show: s.selection_stages > 0 },
    { key: "제출서류", show: !!(s.required_documents && s.required_documents.length > 0) },
    { key: "신청방법", show: !!s.apply_method },
  ];
  const tabs = allTabs.filter((t) => t.show).map((t) => t.key);

  const [activeTab, setActiveTab] = useState<TabKey>("상세정보");

  return (
    <div className="mt-6">
      {/* 탭 네비 */}
      <div className="border-b border-gray-200">
        <div className="flex overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="mt-6">
        {activeTab === "상세정보" && <DetailTab s={s} />}
        {activeTab === "지원자격" && (
          <section>
            <h3 className="mb-4 text-sm font-bold text-gray-900">지원자격</h3>
            <QualSection s={s} />
          </section>
        )}
        {activeTab === "선발절차" && (
          <section>
            <h3 className="mb-4 text-sm font-bold text-gray-900">선발 절차</h3>
            <SelectionSection s={s} />
          </section>
        )}
        {activeTab === "제출서류" && (
          <section>
            <h3 className="mb-4 text-sm font-bold text-gray-900">제출 서류</h3>
            <DocumentsSection s={s} />
          </section>
        )}
        {activeTab === "신청방법" && (
          <section>
            <h3 className="mb-4 text-sm font-bold text-gray-900">신청 방법</h3>
            <ApplySection s={s} />
          </section>
        )}
      </div>
    </div>
  );
}
