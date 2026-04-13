"use client";

import { useTransition } from "react";
import type { Scholarship } from "@/lib/database.types";

type Props = {
  defaultValues?: Partial<Scholarship>;
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  submitLabel?: string;
};

const INSTITUTION_TYPES = [
  "국가기관", "지방자치단체", "공공기관", "기업", "재단법인",
  "학교법인", "언론/방송", "종교단체", "기타",
];

const SUPPORT_CATEGORIES = [
  "등록금", "생활비", "학업장려금", "연구비", "해외연수비", "기타",
];

export default function ScholarshipForm({
  defaultValues: dv = {},
  action,
  submitLabel = "저장",
}: Props) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await action(formData);
      if (result && "error" in result && result.error) {
        alert(`오류: ${result.error}`);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* ── 기본 정보 ─────────────────────────────────────────── */}
      <Section title="기본 정보">
        <Field label="장학금명 *" name="name" defaultValue={dv.name ?? ""} required />
        <Field label="운영 기관 *" name="organization" defaultValue={dv.organization ?? ""} required />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">기관 유형 *</label>
          <select
            name="institution_type"
            defaultValue={dv.institution_type ?? ""}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">선택</option>
            {INSTITUTION_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">지원 유형 * (복수 선택)</label>
          <div className="flex flex-wrap gap-2">
            {SUPPORT_CATEGORIES.map((cat) => (
              <label key={cat} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  name="support_types_check"
                  value={cat}
                  defaultChecked={(dv.support_types ?? []).includes(cat as never)}
                  className="rounded"
                />
                {cat}
              </label>
            ))}
          </div>
          {/* 숨겨진 필드로 합쳐서 전송 — JS로 처리 */}
          <CheckboxToHidden name="support_types" checkboxName="support_types_check" />
        </div>
        <Field label="지원 금액 (원) *" name="support_amount" type="number" defaultValue={dv.support_amount?.toString() ?? ""} required />
        <Field label="선발 인원" name="selection_count" type="number" defaultValue={dv.selection_count?.toString() ?? ""} />
      </Section>

      {/* ── 신청 기간 ─────────────────────────────────────────── */}
      <Section title="신청 기간 / 일정">
        <Field label="신청 시작일 *" name="apply_start_date" type="date" defaultValue={dv.apply_start_date ?? ""} required />
        <Field label="신청 마감일 *" name="apply_end_date" type="date" defaultValue={dv.apply_end_date ?? ""} required />
        <Field label="발표일" name="announcement_date" type="date" defaultValue={dv.announcement_date ?? ""} />
      </Section>

      {/* ── 자격 요건 ─────────────────────────────────────────── */}
      <Section title="자격 요건 (비워두면 제한 없음)">
        <Field label="최소 누적 학점" name="qual_gpa_min" type="number" step="0.01" defaultValue={dv.qual_gpa_min?.toString() ?? ""} placeholder="예: 3.0" />
        <Field label="최소 직전 학기 학점" name="qual_gpa_last_semester_min" type="number" step="0.01" defaultValue={dv.qual_gpa_last_semester_min?.toString() ?? ""} placeholder="예: 3.5" />
        <Field label="소득 분위 최소" name="qual_income_level_min" type="number" defaultValue={dv.qual_income_level_min?.toString() ?? ""} />
        <Field label="소득 분위 최대" name="qual_income_level_max" type="number" defaultValue={dv.qual_income_level_max?.toString() ?? ""} />
        <Field label="최대 가구원 수" name="qual_household_size_max" type="number" defaultValue={dv.qual_household_size_max?.toString() ?? ""} />
        <Field label="최소 나이" name="qual_age_min" type="number" defaultValue={dv.qual_age_min?.toString() ?? ""} />
        <Field label="최대 나이" name="qual_age_max" type="number" defaultValue={dv.qual_age_max?.toString() ?? ""} />
        <Field label="지역 (쉼표 구분)" name="qual_region" defaultValue={(dv.qual_region ?? []).join(", ")} placeholder="예: 서울, 경기" />
        <Field label="전공 (쉼표 구분)" name="qual_major" defaultValue={(dv.qual_major ?? []).join(", ")} placeholder="예: 컴퓨터공학, 전자공학" />
      </Section>

      {/* ── 신청 방법 ─────────────────────────────────────────── */}
      <Section title="신청 방법">
        <Field label="신청 방법 *" name="apply_method" defaultValue={dv.apply_method ?? ""} required placeholder="예: 온라인 신청" />
        <Field label="신청 URL *" name="apply_url" type="url" defaultValue={dv.apply_url ?? ""} required placeholder="https://" />
        <Field label="홈페이지 URL" name="homepage_url" type="url" defaultValue={dv.homepage_url ?? ""} placeholder="https://" />
        <Field label="문의처" name="contact" defaultValue={dv.contact ?? ""} placeholder="예: 02-1234-5678" />
        <Field label="제출 서류 (쉼표 구분)" name="required_documents" defaultValue={(dv.required_documents ?? []).join(", ")} placeholder="예: 재학증명서, 성적증명서" />
        <div className="flex items-center gap-2">
          <input type="hidden" name="can_overlap" value="false" />
          <input
            type="checkbox"
            id="can_overlap"
            name="can_overlap"
            value="true"
            defaultChecked={dv.can_overlap ?? false}
            className="rounded"
          />
          <label htmlFor="can_overlap" className="text-sm text-gray-700">
            다른 장학금과 중복 수혜 가능
          </label>
        </div>
      </Section>

      {/* ── 선발 단계 ─────────────────────────────────────────── */}
      <Section title="선발 단계">
        <Field label="선발 단계 수 *" name="selection_stages" type="number" min="1" max="5" defaultValue={dv.selection_stages?.toString() ?? "1"} required />
        {[1, 2, 3, 4, 5].map((n) => (
          <Field
            key={n}
            label={`${n}차 선발`}
            name={`selection_stage_${n}`}
            defaultValue={(dv as Record<string, unknown>)[`selection_stage_${n}`] as string ?? ""}
            required={n === 1}
          />
        ))}
        <Field label="선발 비고" name="selection_note" defaultValue={dv.selection_note ?? ""} />
      </Section>

      {/* ── 기타 ──────────────────────────────────────────────── */}
      <Section title="기타">
        <Field label="포스터 이미지 URL" name="poster_image_url" type="url" defaultValue={dv.poster_image_url ?? ""} placeholder="https://" />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">비고</label>
          <textarea
            name="note"
            defaultValue={dv.note ?? ""}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <input type="hidden" name="is_verified" value="false" />
          <input
            type="checkbox"
            id="is_verified"
            name="is_verified"
            value="true"
            defaultChecked={dv.is_verified ?? false}
            className="rounded"
          />
          <label htmlFor="is_verified" className="text-sm text-gray-700">
            검증 완료 (검증된 장학금은 사용자에게 노출)
          </label>
        </div>
      </Section>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {isPending ? "저장 중..." : submitLabel}
        </button>
        <a
          href="/admin/scholarships"
          className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          취소
        </a>
      </div>
    </form>
  );
}

// ── 재사용 가능한 입력 필드 컴포넌트 ───────────────────────────────
function Field({
  label,
  name,
  type = "text",
  defaultValue = "",
  required = false,
  placeholder = "",
  step,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        step={step}
        min={min}
        max={max}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

// ── 체크박스 → 숨겨진 hidden input 동기화 ─────────────────────────
function CheckboxToHidden({
  name,
  checkboxName,
}: {
  name: string;
  checkboxName: string;
}) {
  return (
    <input
      type="hidden"
      name={name}
      ref={(el) => {
        if (!el) return;
        const form = el.form;
        if (!form) return;
        const sync = () => {
          const checked = Array.from(
            form.querySelectorAll<HTMLInputElement>(`input[name="${checkboxName}"]:checked`)
          ).map((cb) => cb.value);
          el.value = checked.join(",");
        };
        form.querySelectorAll<HTMLInputElement>(`input[name="${checkboxName}"]`).forEach((cb) => {
          cb.removeEventListener("change", sync);
          cb.addEventListener("change", sync);
        });
        sync();
      }}
    />
  );
}

// ── Section 래퍼 ──────────────────────────────────────────────────
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}
