"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { Scholarship } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

type Props = {
  defaultValues?: Partial<Scholarship>;
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  submitLabel?: string;
  returnPath?: string;
};

const INSTITUTION_TYPES = [
  "기업",
  "공공기관",
  "재단법인",
  "국가기관",
  "지방자치단체",
  "학교법인",
  "기타",
];

export default function AdForm({
  defaultValues: dv = {},
  action,
  submitLabel = "저장",
  returnPath = "/admin/ads",
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>(() =>
    extractInitialScheduleRows(dv)
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validRows = scheduleRows.filter((row) => row.title.trim() && row.startDate);
    if (validRows.length === 0) {
      alert("주요 일정은 최소 1개 이상 입력해주세요. (일정 내용 + 시작일)");
      return;
    }
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
      <input type="hidden" name="admin_return_path" value={returnPath} />
      <input type="hidden" name="is_advertisement" value="true" />
      <input type="hidden" name="support_types" value="기타" />
      <input type="hidden" name="required_documents" value={(dv.required_documents ?? []).join(", ")} />
      <input type="hidden" name="can_overlap" value="false" />
      <input type="hidden" name="contact" value={dv.contact ?? ""} />
      <input type="hidden" name="selection_stages" value={String(Math.max(1, scheduleRows.filter((r) => r.title.trim() && r.startDate).length))} />
      {Array.from({ length: 5 }, (_, index) => {
        const row = scheduleRows[index];
        const hasValue = row && row.title.trim() && row.startDate;
        const stageName = hasValue ? row.title.trim() : "";
        const stageSchedule = hasValue ? formatScheduleDateRange(row.startDate, row.endDate) : "";
        const n = index + 1;
        return (
          <div key={n}>
            <input type="hidden" name={`selection_stage_${n}`} value={stageName} />
            <input type="hidden" name={`selection_stage_${n}_schedule`} value={stageSchedule} />
          </div>
        );
      })}

      <Section title="핵심 요약 정보">
        <Field label="공고명 *" name="name" defaultValue={dv.name ?? ""} required />
        <Field label="기업/기관명 *" name="organization" defaultValue={dv.organization ?? ""} required />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">기관 유형 *</label>
          <select
            name="institution_type"
            defaultValue={dv.institution_type ?? "기업"}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {INSTITUTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="모집 직무 *"
          name="ad_job_role"
          defaultValue={dv.ad_job_role ?? ""}
          placeholder="예: 인턴(콘텐츠 마케팅)"
          required
        />
        <Field
          label="급여 문구 *"
          name="support_amount_text"
          defaultValue={dv.support_amount_text ?? ""}
          placeholder="예: 월 250만원(세전)"
          required
        />
        <Field
          label="선발 인원"
          name="selection_count"
          type="number"
          defaultValue={dv.selection_count != null ? String(dv.selection_count) : ""}
          placeholder="예: 3"
        />
        <Field
          label="광고 노출 순서"
          name="recommended_sort_order"
          type="number"
          defaultValue={dv.recommended_sort_order != null ? String(dv.recommended_sort_order) : ""}
          placeholder="예: 4 (전체 목록 4번째 카드)"
          min="1"
        />
        <div className="md:col-span-2">
          <p className="text-xs text-gray-500">
            숫자를 입력하면 전체 장학금 목록에서 해당 순서에 광고 카드를 배치합니다. 비우면 기본 정렬 규칙을 따릅니다.
          </p>
        </div>
        <Field
          label="접수 시작일 *"
          name="apply_start_date"
          type="date"
          defaultValue={dv.apply_start_date ?? ""}
          required
        />
        <Field
          label="접수 마감일 *"
          name="apply_end_date"
          type="date"
          defaultValue={dv.apply_end_date ?? ""}
          required
        />
      </Section>

      <Section title="상세 정보">
        <Field
          label="요구 역량 (쉼표 구분) *"
          name="ad_required_skills"
          defaultValue={(dv.ad_required_skills ?? []).join(", ")}
          placeholder="예: Figma, 문서작성, 커뮤니케이션"
          required
        />
        <Field
          label="소재지 *"
          name="ad_location"
          defaultValue={dv.ad_location ?? ""}
          placeholder="예: 서울 강남구(하이브리드)"
          required
        />
        <Field
          label="지원 방법 *"
          name="apply_method"
          defaultValue={dv.apply_method ?? ""}
          placeholder="예: 홈페이지 지원서 작성 후 제출"
          required
        />
        <Field
          label="지원 링크(URL) *"
          name="apply_url"
          type="url"
          defaultValue={dv.apply_url ?? ""}
          placeholder="https://"
          required
        />
        <Field
          label="결과 발표일"
          name="announcement_date"
          type="date"
          defaultValue={dv.announcement_date ?? ""}
        />
      </Section>

      <Section title="주요 일정">
        <div className="md:col-span-2 space-y-3">
          {scheduleRows.map((row, index) => (
            <div key={row.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                <div className="md:col-span-5">
                  <label className="mb-1 block text-xs font-medium text-gray-600">일정 내용</label>
                  <input
                    type="text"
                    value={row.title}
                    onChange={(e) =>
                      setScheduleRows((prev) =>
                        prev.map((item) =>
                          item.id === row.id ? { ...item, title: e.target.value } : item
                        )
                      )
                    }
                    placeholder="예: 서류 접수, 1차 면접"
                    required={index === 0}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-medium text-gray-600">시작일</label>
                  <input
                    type="date"
                    value={row.startDate}
                    onChange={(e) =>
                      setScheduleRows((prev) =>
                        prev.map((item) =>
                          item.id === row.id ? { ...item, startDate: e.target.value } : item
                        )
                      )
                    }
                    required={index === 0}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-medium text-gray-600">종료일 (선택)</label>
                  <input
                    type="date"
                    value={row.endDate}
                    min={row.startDate || undefined}
                    onChange={(e) =>
                      setScheduleRows((prev) =>
                        prev.map((item) =>
                          item.id === row.id ? { ...item, endDate: e.target.value } : item
                        )
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="md:col-span-1 md:flex md:items-end">
                  <button
                    type="button"
                    onClick={() =>
                      setScheduleRows((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.id !== row.id)))
                    }
                    disabled={scheduleRows.length <= 1}
                    className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">최대 5개까지 입력할 수 있어요.</p>
            <button
              type="button"
              onClick={() =>
                setScheduleRows((prev) =>
                  prev.length >= 5
                    ? prev
                    : [...prev, { id: `row-${Date.now()}-${Math.random()}`, title: "", startDate: "", endDate: "" }]
                )
              }
              disabled={scheduleRows.length >= 5}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              일정 추가
            </button>
          </div>
        </div>
      </Section>

      <Section title="노출 및 원본 공고문">
        <div className="md:col-span-2">
          <ImageUploadInput
            name="poster_image_url"
            label="포스터 이미지"
            defaultUrl={dv.poster_image_url ?? ""}
            multiple={false}
          />
        </div>
        <div className="md:col-span-2">
          <ImageUploadInput
            name="original_notice_image_urls"
            label="원본 공고문 이미지"
            defaultUrls={
              dv.original_notice_image_urls && dv.original_notice_image_urls.length > 0
                ? dv.original_notice_image_urls
                : dv.original_notice_image_url
                  ? [dv.original_notice_image_url]
                  : []
            }
            multiple
          />
          <input
            type="hidden"
            name="original_notice_image_url"
            value={
              dv.original_notice_image_urls?.[0] ??
              dv.original_notice_image_url ??
              ""
            }
          />
        </div>
        <TextArea
          label="원본 공고문 내용"
          name="original_notice_text"
          defaultValue={dv.original_notice_text ?? ""}
          rows={8}
          placeholder="원본 공고문 텍스트를 붙여넣으세요."
        />
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
            홈 전체 목록에 표시
          </label>
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
            검증 완료 (사용자 노출)
          </label>
        </div>
      </Section>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/85 disabled:opacity-60"
        >
          {isPending ? "저장 중..." : submitLabel}
        </button>
        <a
          href={returnPath}
          className="rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          취소
        </a>
      </div>
    </form>
  );
}

type ScheduleRow = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
};

function formatScheduleDateRange(startDate: string, endDate: string): string {
  if (!startDate) return "";
  if (!endDate) return startDate;
  return `${startDate} ~ ${endDate}`;
}

function extractInitialScheduleRows(dv: Partial<Scholarship>): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (let n = 1; n <= 5; n++) {
    const title = (dv as Record<string, unknown>)[`selection_stage_${n}`] as string | null | undefined;
    const schedule = (dv as Record<string, unknown>)[`selection_stage_${n}_schedule`] as string | null | undefined;
    if (!title?.trim()) continue;
    const parsed = parseScheduleRange(schedule ?? "");
    rows.push({
      id: `init-${n}`,
      title: title.trim(),
      startDate: parsed.startDate,
      endDate: parsed.endDate,
    });
  }
  if (rows.length === 0) {
    rows.push({ id: "init-1", title: "", startDate: "", endDate: "" });
  }
  return rows;
}

function parseScheduleRange(value: string): { startDate: string; endDate: string } {
  const matches = value.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  return {
    startDate: matches[0] ?? "",
    endDate: matches[1] ?? "",
  };
}

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
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        min={min}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function ImageUploadInput({
  name,
  label,
  defaultUrl,
  defaultUrls,
  multiple = false,
}: {
  name: string;
  label: string;
  defaultUrl?: string;
  defaultUrls?: string[];
  multiple?: boolean;
}) {
  const initialUrls = defaultUrls ?? (defaultUrl ? [defaultUrl] : []);
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [localPreviews, setLocalPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const previews = uploading && localPreviews.length > 0 ? localPreviews : urls;

  const upload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("파일 크기는 10MB 이하여야 합니다.");
      return;
    }

    setError("");
    setUploading(true);
    const localUrl = URL.createObjectURL(file);
    setLocalPreviews(multiple ? (prev) => [...prev, localUrl] : [localUrl]);

    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("scholarship-posters")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("scholarship-posters").getPublicUrl(path);
      setUrls((prev) => (multiple ? [...prev, data.publicUrl] : [data.publicUrl]));
      URL.revokeObjectURL(localUrl);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setLocalPreviews((prev) => prev.filter((preview) => preview !== localUrl));
      setUploading(false);
    }
  }, [multiple]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (!item.type.startsWith("image/")) continue;
        const target = e.target as Node | null;
        if (dropZoneRef.current && target && !dropZoneRef.current.contains(target)) {
          continue;
        }
        e.preventDefault();
        const file = item.getAsFile();
        if (file) void upload(file);
        break;
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [upload]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    Array.from(e.dataTransfer.files).forEach((file) => {
      if (file) void upload(file);
    });
  };

  const handleRemove = (targetUrl?: string) => {
    setUrls((prev) => (targetUrl ? prev.filter((url) => url !== targetUrl) : []));
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input type="hidden" name={name} value={multiple ? JSON.stringify(urls) : urls[0] ?? ""} />

      {previews.length === 0 ? (
        <div
          ref={dropZoneRef}
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition-colors ${
            isDragOver
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/40"
          }`}
        >
          {uploading ? (
            <span className="text-sm font-medium text-blue-600">업로드 중...</span>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700">클릭/드래그 또는 붙여넣기(Ctrl+V)</p>
              <p className="text-xs text-gray-400">JPG, PNG, WebP, GIF / 최대 10MB</p>
              <p className="text-xs text-gray-400">
                붙여넣기는 이 박스를 클릭해 포커스한 뒤 사용하세요.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className={multiple ? "grid gap-3 sm:grid-cols-2" : ""}>
            {previews.map((preview, i) => (
              <div key={`${preview}-${i}`} className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt={`${label} 미리보기 ${i + 1}`} className="max-h-96 w-full object-contain" />
                <button
                  type="button"
                  onClick={() => handleRemove(preview)}
                  className="absolute right-2 top-2 rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-red-600"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {multiple ? "이미지 추가" : "교체"}
            </button>
            <button
              type="button"
              onClick={() => handleRemove()}
              className="rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
            >
              전체 삭제
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          Array.from(e.target.files ?? []).forEach((file) => void upload(file));
        }}
      />
    </div>
  );
}

function TextArea({
  label,
  name,
  defaultValue = "",
  rows = 4,
  placeholder = "",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="md:col-span-2">
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-base font-semibold text-gray-900">{title}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}
