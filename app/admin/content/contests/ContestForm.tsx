"use client";

import { useState, useTransition } from "react";
import type { Contest, SelectionStagePhase } from "@/lib/database.types";
import { INTEREST_CATEGORIES } from "@/lib/interestCategories";
import { adminKindLabel } from "@/lib/admin-kinds";
import type { ContestContentKind } from "@/lib/admin-kinds";

type SelectionStageRow = {
  id: string;
  title: string;
  phase: SelectionStagePhase;
  scheduleText: string;
  note: string;
};

type Props = {
  defaultValues?: Partial<Contest> & {
    selection_stages?: Array<{
      title: string;
      phase: SelectionStagePhase;
      schedule_date?: string | null;
      schedule_text?: string | null;
      note?: string | null;
    }>;
  };
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  submitLabel: string;
  returnPath: string;
  lockedKind: ContestContentKind;
};

let stageSeq = 0;
function makeStageId(): string {
  stageSeq += 1;
  return `stage-${Date.now()}-${stageSeq}`;
}

function emptyStageRow(): SelectionStageRow {
  return { id: makeStageId(), title: "", phase: "selection", scheduleText: "", note: "" };
}

type StageInput = NonNullable<
  NonNullable<Props["defaultValues"]>["selection_stages"]
>[number];

function stageRowsFromDefaults(stages?: StageInput[]): SelectionStageRow[] {
  if (!stages || stages.length === 0) return [emptyStageRow()];
  return stages.map((s) => ({
    id: makeStageId(),
    title: s.title,
    phase: s.phase,
    scheduleText: s.schedule_text ?? "",
    note: s.note ?? "",
  }));
}

export default function ContestForm({
  defaultValues: dv = {},
  action,
  submitLabel,
  returnPath,
  lockedKind,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // interest_categories as a Set for toggle logic
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(dv.interest_categories ?? [])
  );

  // selection stages
  const [stageRows, setStageRows] = useState<SelectionStageRow[]>(() =>
    stageRowsFromDefaults(dv.selection_stages)
  );

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateStageRow = (rowId: string, patch: Partial<Omit<SelectionStageRow, "id">>) => {
    setStageRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
  };
  const addStageRow = () => setStageRows((prev) => [...prev, emptyStageRow()]);
  const removeStageRow = (rowId: string) =>
    setStageRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== rowId)));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    // Inject interest_categories as comma-joined string
    formData.set("interest_categories", Array.from(selectedCategories).join(","));
    // Inject selection_stages_json
    formData.set(
      "selection_stages_json",
      JSON.stringify(
        stageRows
          .filter((r) => r.title.trim())
          .map((r) => ({
            title: r.title.trim(),
            phase: r.phase,
            schedule_text: r.scheduleText.trim() || null,
            note: r.note.trim() || null,
          }))
      )
    );
    startTransition(async () => {
      const result = await action(formData);
      if (result && "error" in result && result.error) {
        setError(result.error);
      }
    });
  };

  const kindLabel = adminKindLabel(lockedKind);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* hidden fields */}
      <input type="hidden" name="admin_return_path" value={returnPath} />
      <input type="hidden" name="content_kind" value={lockedKind} />
      <input type="hidden" name="document_files" value="[]" />
      <input type="hidden" name="original_notice_image_urls" value="[]" />

      {/* ── 기본 정보 ─────────────────────────────────────────── */}
      <Section title="기본 정보">
        <Field label={`${kindLabel}명 *`} name="name" defaultValue={dv.name ?? ""} required />
        <Field
          label="주최 기관 *"
          name="organization"
          defaultValue={dv.organization ?? ""}
          required
        />
        <Field
          label="기관 유형"
          name="organization_type"
          defaultValue={dv.organization_type ?? ""}
          placeholder="예: 기업, 공공기관, 재단법인"
        />
        <Field
          label="지원 규모 표시 문구"
          name="support_amount_text"
          defaultValue={dv.support_amount_text ?? ""}
          placeholder="예: 최대 500만원, 수상자 전원 장학금"
        />
        <Field
          label="선발 인원"
          name="selection_count"
          type="number"
          defaultValue={dv.selection_count?.toString() ?? ""}
        />
      </Section>

      {/* ── 기간 ──────────────────────────────────────────────── */}
      <Section title="기간">
        <Field
          label="신청 시작일"
          name="apply_start_date"
          type="date"
          defaultValue={dv.apply_start_date ?? ""}
        />
        <Field
          label="신청 마감일"
          name="apply_end_date"
          type="date"
          defaultValue={dv.apply_end_date ?? ""}
        />
        <Field
          label="발표일"
          name="announcement_date"
          type="date"
          defaultValue={dv.announcement_date ?? ""}
        />
      </Section>

      {/* ── 메타 ──────────────────────────────────────────────── */}
      <Section title="메타">
        <Field
          label="대상 (쉼표 구분)"
          name="targets"
          defaultValue={(dv.targets ?? []).join(", ")}
          placeholder="예: 대학생, 청년, 누구나"
        />
        <Field
          label="혜택 (쉼표 구분)"
          name="benefits"
          defaultValue={(dv.benefits ?? []).join(", ")}
          placeholder="예: 상금, 수료증, 인턴 기회"
        />
        <Field
          label="신청 유형 (쉼표 구분)"
          name="apply_types"
          defaultValue={(dv.apply_types ?? []).join(", ")}
          placeholder="예: 개인, 팀, 기업"
        />
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">관심 분야</label>
          <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            {INTEREST_CATEGORIES.map((cat) => (
              <label
                key={cat.id}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.has(cat.id)}
                  onChange={() => toggleCategory(cat.id)}
                  className="rounded"
                />
                {cat.label}
              </label>
            ))}
          </div>
        </div>
      </Section>

      {/* ── 신청 ──────────────────────────────────────────────── */}
      <Section title="신청">
        <Field
          label="신청 방법 *"
          name="apply_method"
          defaultValue={dv.apply_method ?? ""}
          required
          placeholder="예: 온라인 신청, 이메일 접수"
        />
        <Field
          label="신청 URL *"
          name="apply_url"
          type="url"
          defaultValue={dv.apply_url ?? ""}
          required
          placeholder="https://"
        />
        <Field
          label="홈페이지 URL"
          name="homepage_url"
          type="url"
          defaultValue={dv.homepage_url ?? ""}
          placeholder="https://"
        />
        <Field
          label="문의처"
          name="contact"
          defaultValue={dv.contact ?? ""}
          placeholder="예: 02-1234-5678"
        />
        <div className="md:col-span-2">
          <RequiredDocumentsInput
            defaultValue={dv.required_documents ?? []}
          />
        </div>
      </Section>

      {/* ── 선발 단계 ─────────────────────────────────────────── */}
      <Section title="선발 단계">
        <div className="md:col-span-2">
          <p className="mb-3 text-xs text-gray-500">
            지원자가 통과해야 하는 선발 관문과, 합격 후 이어지는 절차를 순서대로 입력하세요.
          </p>
          <div className="space-y-3">
            {stageRows.map((row, index) => (
              <div
                key={row.id}
                className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                  <div className="md:col-span-4">
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      {index + 1}차 단계명
                    </label>
                    <input
                      type="text"
                      value={row.title}
                      onChange={(e) => updateStageRow(row.id, { title: e.target.value })}
                      placeholder="예: 서류 심사, 면접, 발표"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="mb-1 block text-xs font-medium text-gray-600">구분</label>
                    <select
                      value={row.phase}
                      onChange={(e) =>
                        updateStageRow(row.id, {
                          phase:
                            e.target.value === "post_acceptance"
                              ? "post_acceptance"
                              : "selection",
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="selection">선발 관문</option>
                      <option value="post_acceptance">합격 이후 절차</option>
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      일정 표시 문구
                    </label>
                    <input
                      type="text"
                      value={row.scheduleText}
                      onChange={(e) => updateStageRow(row.id, { scheduleText: e.target.value })}
                      placeholder="예: 2026-08-10, 추후 공지"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2 md:flex md:items-end">
                    <button
                      type="button"
                      onClick={() => removeStageRow(row.id)}
                      disabled={stageRows.length <= 1}
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      삭제
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    보조 설명 (선택)
                  </label>
                  <input
                    type="text"
                    value={row.note}
                    onChange={(e) => updateStageRow(row.id, { note: e.target.value })}
                    placeholder="예: 참석 필수, 온라인 진행"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addStageRow}
            className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            + 단계 추가
          </button>
        </div>
        <Field
          label="선발 비고"
          name="selection_note"
          defaultValue={dv.selection_note ?? ""}
        />
      </Section>

      {/* ── 원문 ──────────────────────────────────────────────── */}
      <Section title="원문">
        <Field
          label="포스터 이미지 URL"
          name="poster_image_url"
          type="url"
          defaultValue={dv.poster_image_url ?? ""}
          placeholder="https://"
        />
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">원본 공고문 내용</label>
          <textarea
            name="original_notice_text"
            defaultValue={dv.original_notice_text ?? ""}
            rows={8}
            placeholder="기관 공고문 원문을 붙여넣으세요."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </Section>

      {/* ── 발행 ──────────────────────────────────────────────── */}
      <Section title="발행">
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
            검증 완료 (사용자에게 노출)
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input type="hidden" name="list_on_home" value="false" />
          <input
            type="checkbox"
            id="list_on_home"
            name="list_on_home"
            value="true"
            defaultChecked={dv.list_on_home !== false}
            className="rounded"
          />
          <label htmlFor="list_on_home" className="text-sm text-gray-700">
            홈 목록에 표시
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input type="hidden" name="is_recommended" value="false" />
          <input
            type="checkbox"
            id="is_recommended"
            name="is_recommended"
            value="true"
            defaultChecked={dv.is_recommended === true}
            className="rounded"
          />
          <label htmlFor="is_recommended" className="text-sm text-gray-700">
            추천 (홈 상단 노출)
          </label>
        </div>
        <Field
          label="추천 노출 순서"
          name="recommended_sort_order"
          type="number"
          min="0"
          defaultValue={
            dv.recommended_sort_order != null ? String(dv.recommended_sort_order) : ""
          }
          placeholder="작을수록 앞 (비우면 맨 뒤)"
        />
      </Section>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          오류: {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {isPending ? "저장 중..." : submitLabel}
        </button>
        <a
          href={returnPath}
          className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          취소
        </a>
      </div>
    </form>
  );
}

// ── 제출 서류 입력 (JSON array로 직렬화) ─────────────────────────
function RequiredDocumentsInput({ defaultValue }: { defaultValue: string[] }) {
  const [items, setItems] = useState<string[]>(defaultValue);
  const [input, setInput] = useState("");

  const add = () => {
    const v = input.trim();
    if (v && !items.includes(v)) setItems((prev) => [...prev, v]);
    setInput("");
  };

  const remove = (item: string) => setItems((prev) => prev.filter((x) => x !== item));

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">제출 서류</label>
      <input
        type="hidden"
        name="required_documents"
        value={JSON.stringify(items)}
      />
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
            >
              {item}
              <button
                type="button"
                onClick={() => remove(item)}
                className="hover:text-red-500"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="서류명 입력 후 Enter (예: 재학증명서)"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
        >
          추가
        </button>
      </div>
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────────
function Field({
  label,
  name,
  type = "text",
  defaultValue = "",
  required = false,
  placeholder = "",
  min,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  min?: string;
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
        min={min}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}
