"use client";

import { useState, useEffect, useRef } from "react";
import Script from "next/script";
import BrandLogo from "@/components/BrandLogo";
import { createClient } from "@/lib/supabase/client";
import { loadProfile, saveProfile, type OnboardingFormData } from "./actions";

// ── Kakao Postcode 타입 ──────────────────────────────────────────────────
declare global {
  interface Window {
    daum: {
      Postcode: new (config: {
        oncomplete: (data: { roadAddress: string }) => void;
        width?: string | number;
        height?: string | number;
      }) => { open: () => void; embed: (el: HTMLElement) => void };
    };
  }
}

// ── 주소 검색 모달 ────────────────────────────────────────────────────────
function AddressModal({
  onSelect,
  onClose,
}: {
  onSelect: (address: string) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !window.daum?.Postcode) return;
    new window.daum.Postcode({
      oncomplete: (data) => { onSelect(data.roadAddress); onClose(); },
      width: "100%",
      height: "100%",
    }).embed(containerRef.current);
  }, [onSelect, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-900">주소 검색</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div ref={containerRef} style={{ height: 460 }} />
      </div>
    </div>
  );
}

// ── 상수 ──────────────────────────────────────────────────────────────────
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 1949 }, (_, i) => String(THIS_YEAR - 18 - i));
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));

const SCHOOL_CATEGORIES = ["4년제", "전문대", "대학원", "사이버대", "방통대"];
const ENROLLMENT_STATUSES = [
  { value: "재학", label: "재학" },
  { value: "휴학", label: "휴학" },
  { value: "수료/졸업유예", label: "수료/졸업유예" },
];
const ADMISSION_TYPES = ["일반입학", "편입학", "재입학"];
const ACADEMIC_TERMS = [
  { value: "1-1", label: "1학년 1학기", year: "1", semester: "1" },
  { value: "1-2", label: "1학년 2학기", year: "1", semester: "2" },
  { value: "2-1", label: "2학년 1학기", year: "2", semester: "1" },
  { value: "2-2", label: "2학년 2학기", year: "2", semester: "2" },
  { value: "3-1", label: "3학년 1학기", year: "3", semester: "1" },
  { value: "3-2", label: "3학년 2학기", year: "3", semester: "2" },
  { value: "4-1", label: "4학년 1학기", year: "4", semester: "1" },
  { value: "4-2", label: "4학년 2학기", year: "4", semester: "2" },
  { value: "4-2+", label: "4학년 2학기 초과", year: "5", semester: "1" },
];
const INCOME_LEVELS = [
  { value: "0", label: "0구간 (기초/차상위)" },
  ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}구간` })),
  { value: "unknown", label: "미파악" },
];
const SPECIAL_INFO_OPTIONS = [
  "다문화가정", "기초생활수급자", "차상위계층", "장애인(본인)", "장애인(가정)",
  "농어촌자녀", "보훈대상자", "조부모가정", "다자녀", "한부모가정",
  "학생가장", "북한이탈주민", "자립준비청년", "독립유공자후손", "공상자", "산재근로자 가정",
  "순직자유자녀",
];
const PARENT_OCCUPATION_OPTIONS = [
  "직업군인", "군무원", "농축어업인", "건설근로자", "소상공인",
  "경찰/소방관", "택배기사", "환경미화원", "연극인", "외국인 근로자",
];
const MILITARY_STATUS_OPTIONS = ["군필", "미필", "비대상", "면제"];
const STEPS = ["인적사항", "학적사항", "재정/가계", "기타/특수"];

// ── 유틸 ──────────────────────────────────────────────────────────────────
function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

// ── 공통 컴포넌트 ─────────────────────────────────────────────────────────
function Field({ label, optional = false, children }: {
  label: string; optional?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
        {label}
        {optional && <span className="text-xs font-normal text-gray-400">선택</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/10 disabled:bg-gray-50 disabled:text-ink/40"
    />
  );
}

function SelectInput({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full cursor-pointer appearance-none rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/10 disabled:bg-gray-50 disabled:text-ink/40 disabled:cursor-not-allowed"
    >
      {children}
    </select>
  );
}

function RadioChip({ label, selected, onClick }: {
  label: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
        selected
          ? "border-brand bg-brand/10 text-brand"
          : "border-gray-200 bg-white text-ink/70 hover:border-brand/40 hover:bg-cream"
      }`}
    >
      {label}
    </button>
  );
}

function CheckChip({ label, selected, onClick }: {
  label: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
        selected
          ? "border-brand bg-brand text-white"
          : "border-gray-200 bg-white text-ink/70 hover:border-brand/50 hover:text-brand"
      }`}
    >
      {label}
    </button>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? "bg-brand" : "bg-gray-200"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

// ── 스텝 인디케이터 ───────────────────────────────────────────────────────
function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="mb-8 flex items-center justify-center">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all ${
              i < current ? "bg-brand text-white"
              : i === current ? "bg-brand text-white ring-4 ring-brand/20"
              : "bg-gray-100 text-ink/50"
            }`}>
              {i < current ? "✓" : i + 1}
            </div>
            <span className={`hidden text-xs font-medium sm:block ${
              i === current ? "text-brand" : i < current ? "text-ink/70" : "text-ink/40"
            }`}>{step}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`mx-2 mb-4 h-0.5 w-10 transition-all sm:w-16 ${i < current ? "bg-brand" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: 인적사항 ──────────────────────────────────────────────────────
function Step1({ form, update, openAddress, openParentAddress }: {
  form: OnboardingFormData;
  update: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
  openAddress: () => void;
  openParentAddress: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="이름">
        <TextInput value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="홍길동" />
      </Field>

      <Field label="생년월일">
        <div className="flex gap-2">
          <SelectInput value={form.birth_year} onChange={(e) => update("birth_year", e.target.value)}>
            <option value="">년도</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
          </SelectInput>
          <SelectInput value={form.birth_month} onChange={(e) => update("birth_month", e.target.value)}>
            <option value="">월</option>
            {MONTHS.map((m) => <option key={m} value={m}>{m}월</option>)}
          </SelectInput>
          <SelectInput value={form.birth_day} onChange={(e) => update("birth_day", e.target.value)}>
            <option value="">일</option>
            {DAYS.map((d) => <option key={d} value={d}>{d}일</option>)}
          </SelectInput>
        </div>
      </Field>

      <Field label="성별">
        <div className="flex gap-2">
          {["남성", "여성"].map((g) => (
            <RadioChip key={g} label={g} selected={form.gender === g} onClick={() => update("gender", g)} />
          ))}
        </div>
      </Field>

      <Field label="연락처">
        <TextInput
          type="tel"
          value={form.phone}
          onChange={(e) => update("phone", formatPhone(e.target.value))}
          placeholder="010-0000-0000"
          maxLength={13}
        />
      </Field>

      <Field label="주소지">
        <div className="flex gap-2">
          <TextInput value={form.address} readOnly placeholder="검색 버튼을 눌러 주소를 선택해주세요" />
          <button
            type="button"
            onClick={openAddress}
            className="shrink-0 rounded-lg border border-brand/40 px-4 py-2.5 text-sm font-medium text-brand transition hover:bg-cream"
          >
            검색
          </button>
        </div>
      </Field>

      <Field label="국적">
        <div className="flex gap-2">
          {["내국인", "외국인"].map((n) => (
            <RadioChip key={n} label={n} selected={form.nationality === n} onClick={() => update("nationality", n)} />
          ))}
        </div>
      </Field>

      <Field label="기혼 여부" optional>
        <div className="flex gap-2">
          {["미혼", "기혼"].map((m) => (
            <RadioChip key={m} label={m} selected={form.marital_status === m}
              onClick={() => update("marital_status", form.marital_status === m ? "" : m)} />
          ))}
        </div>
      </Field>

      <Field label="부모님과 동거 여부">
        <div className="flex gap-2">
          {["동거", "별거"].map((status) => (
            <RadioChip
              key={status}
              label={status}
              selected={form.parent_cohabitation === status}
              onClick={() => {
                update("parent_cohabitation", status);
                if (status === "동거") update("parent_address", "");
              }}
            />
          ))}
        </div>
      </Field>

      {form.parent_cohabitation === "별거" && (
        <Field label="부모님 주소">
          <div className="flex gap-2">
            <TextInput
              value={form.parent_address}
              readOnly
              placeholder="검색 버튼을 눌러 부모님 주소를 선택해주세요"
            />
            <button
              type="button"
              onClick={openParentAddress}
              className="shrink-0 rounded-lg border border-brand/40 px-4 py-2.5 text-sm font-medium text-brand transition hover:bg-cream"
            >
              검색
            </button>
          </div>
        </Field>
      )}
    </div>
  );
}

// ── Step 2: 학적사항 (org_unit 트리 계층형 선택) ─────────────────────────
type OrgUnitItem = { id: number; name: string; unit_type: string };

// unit_type 기준 라벨. 대학마다 트리 깊이가 다르므로(대학-단과대-학과 vs.
// 대학-단과대-학부-학과) 레벨 인덱스가 아니라 실제 노드 타입으로 라벨을 정한다.
const UNIT_TYPE_LABEL: Record<string, { field: string; placeholder: string; undecided: string }> = {
  university: { field: "소속 대학교", placeholder: "대학교 선택", undecided: "대학교가 정해지지 않았어요" },
  college: { field: "소속 단과대학", placeholder: "단과대학 선택", undecided: "단과대학이 정해지지 않았어요" },
  division: { field: "소속 학부", placeholder: "학부 선택", undecided: "학부가 정해지지 않았어요" },
  department: { field: "소속 학과", placeholder: "학과 선택", undecided: "학과가 정해지지 않았어요 (자유전공·1학년 등)" },
};
const FALLBACK_LABEL = { field: "소속 학과", placeholder: "선택", undecided: "아직 정해지지 않았어요" };

/** 레벨 옵션(같은 부모의 형제 노드)에서 unit_type을 뽑아 라벨을 결정한다. */
function labelForLevel(options: OrgUnitItem[], selectedId: string | undefined) {
  const type = (selectedId && options.find((o) => String(o.id) === selectedId)?.unit_type) || options[0]?.unit_type;
  return (type && UNIT_TYPE_LABEL[type]) || FALLBACK_LABEL;
}

/**
 * org_unit 트리 캐스케이드용 레벨 옵션 로더.
 * levels[0] = startParentId(null이면 대학 루트)의 자식들,
 * levels[i] = path[i-1]로 선택한 노드의 자식들.
 * 마지막 선택 노드에 자식이 있으면 다음 레벨 셀렉트가 자동으로 나타난다 (가변 깊이).
 */
function useOrgUnitLevels(enabled: boolean, startParentId: string | null, path: string[]) {
  const [levels, setLevels] = useState<OrgUnitItem[][]>([]);
  const [loading, setLoading] = useState(false);

  const pathKey = path.join(",");
  useEffect(() => {
    if (!enabled) {
      setLevels([]);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const parents: (string | null)[] = [startParentId, ...path];
      const results = await Promise.all(
        parents.map((parent) => {
          const query = supabase.from("org_units").select("id, name, unit_type");
          return (parent === null ? query.is("parent_id", null) : query.eq("parent_id", parseInt(parent)))
            .order("name")
            .then(({ data }) => data ?? []);
        })
      );
      if (cancelled) return;
      setLevels(results);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, startParentId, pathKey]);

  return { levels, loading };
}

function Step2({ form, update, updateMultiple }: {
  form: OnboardingFormData;
  update: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
  updateMultiple: (updates: Partial<OnboardingFormData>) => void;
}) {
  const isKoreanSchool = form.school_location === "국내 대학";
  const universityId = form.org_unit_path[0] ?? null;

  // 본전공: 대학 루트부터
  const main = useOrgUnitLevels(isKoreanSchool, null, form.org_unit_path);
  // 복수전공: 선택한 대학의 단과대부터
  const dm = useOrgUnitLevels(
    isKoreanSchool && form.has_double_major && !!universityId,
    universityId,
    form.double_major_org_unit_path
  );

  const selectMainLevel = (level: number, value: string) => {
    const nextPath = value
      ? [...form.org_unit_path.slice(0, level), value]
      : form.org_unit_path.slice(0, level);
    updateMultiple({
      org_unit_path: nextPath,
      // 학과가 실제 선택되면 미정 해제, 대학이 바뀌면 복수전공 초기화
      major_undecided: nextPath.length >= 3 ? false : form.major_undecided,
      ...(level === 0 && {
        double_major_org_unit_path: [],
        has_double_major: false,
        major_undecided: false,
      }),
    });
  };

  const selectDmLevel = (level: number, value: string) => {
    update(
      "double_major_org_unit_path",
      value
        ? [...form.double_major_org_unit_path.slice(0, level), value]
        : form.double_major_org_unit_path.slice(0, level)
    );
  };

  const isKorean = isKoreanSchool;
  const academicTermValue = ACADEMIC_TERMS.find(
    (term) => term.year === form.academic_year && term.semester === form.academic_semester
  )?.value ?? "";

  // 표시할 본전공 레벨 수: 선택된 깊이 + 1 (다음 레벨에 옵션이 있을 때만)
  const mainVisibleLevels = main.levels
    .map((options, i) => ({ options, i }))
    .filter(({ options, i }) => i <= form.org_unit_path.length && (i < form.org_unit_path.length || options.length > 0));
  const dmVisibleLevels = dm.levels
    .map((options, i) => ({ options, i }))
    .filter(({ options, i }) => i <= form.double_major_org_unit_path.length && (i < form.double_major_org_unit_path.length || options.length > 0));

  // 현재 경로 다음에 더 내려갈 레벨(옵션)이 있는지 = 아직 리프(department)에 도달하지 못했는지.
  // 트리 로딩이 끝난 뒤에만 신뢰할 수 있으므로 loading 중에는 판단을 미룬다.
  const hasDeeperMainLevel = mainVisibleLevels.length > form.org_unit_path.length;
  useEffect(() => {
    if (!isKoreanSchool || main.loading) return;
    const isLeaf = form.org_unit_path.length >= 2 && !hasDeeperMainLevel;
    if (isLeaf !== form.org_unit_is_leaf) update("org_unit_is_leaf", isLeaf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKoreanSchool, main.loading, form.org_unit_path.length, hasDeeperMainLevel]);

  return (
    <div className="flex flex-col gap-5">
      {/* 학교 소재 */}
      <Field label="학교 소재">
        <div className="flex gap-2">
          {["국내 대학", "해외 대학"].map((l) => (
            <RadioChip key={l} label={l} selected={form.school_location === l}
              onClick={() => updateMultiple({
                school_location: l,
                school_name: "", department: "",
                org_unit_path: [], major_undecided: false, org_unit_is_leaf: false,
                has_double_major: false,
                double_major_org_unit_path: [], double_major_department: "",
              })}
            />
          ))}
        </div>
      </Field>

      {/* 학교 유형 */}
      <Field label="학교 유형">
        <SelectInput value={form.school_category} onChange={(e) => update("school_category", e.target.value)}>
          <option value="">선택해주세요</option>
          {SCHOOL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectInput>
      </Field>

      <Field label="입학 구분" optional>
        <div className="flex flex-wrap gap-2">
          {ADMISSION_TYPES.map((type) => (
            <RadioChip
              key={type}
              label={type}
              selected={form.admission_type === type}
              onClick={() => update("admission_type", form.admission_type === type ? "" : type)}
            />
          ))}
        </div>
      </Field>

      {isKorean ? (
        <>
          {/* 소속 선택: 대학 → 단과대 → (학부) → 학과, 트리 깊이에 따라 가변 */}
          {mainVisibleLevels.map(({ options, i }) => {
            const label = labelForLevel(options, form.org_unit_path[i]);
            return (
              <Field key={i} label={label.field}>
                <SelectInput
                  value={form.org_unit_path[i] ?? ""}
                  disabled={main.loading && options.length === 0}
                  onChange={(e) => selectMainLevel(i, e.target.value)}
                >
                  <option value="">
                    {main.loading && options.length === 0 ? "불러오는 중..." : label.placeholder}
                  </option>
                  {options.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </SelectInput>
              </Field>
            );
          })}

          {/* "미정" 체크박스: 단과대 이상 선택했고, 아직 더 내려갈 하위 단계가 남아있을 때만 노출.
              라벨은 다음 단계의 실제 unit_type(학부/학과 등)에 맞춰 동적으로 표시한다. */}
          {form.org_unit_path.length >= 2 && hasDeeperMainLevel && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={form.major_undecided}
                onChange={(e) => update("major_undecided", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/30"
              />
              아직 {labelForLevel(main.levels[form.org_unit_path.length] ?? [], undefined).undecided}
            </label>
          )}

          {/* 복수전공 토글 */}
          <Field label="복수(이중/부)전공" optional>
            <div className="flex items-center gap-3">
              <Toggle
                on={form.has_double_major}
                onClick={() => {
                  const next = !form.has_double_major;
                  updateMultiple({
                    has_double_major: next,
                    ...(!next && { double_major_org_unit_path: [] }),
                  });
                }}
              />
              <span className="text-sm text-gray-600">
                {form.has_double_major ? "있음" : "없음"}
              </span>
            </div>
          </Field>

          {/* 복수전공 상세 */}
          {form.has_double_major && (
            <div className="flex flex-col gap-4 rounded-xl border border-brand/20 bg-brand/5 p-4">
              <p className="text-xs font-semibold text-brand">제2전공 정보</p>
              {!universityId && (
                <p className="text-xs text-gray-500">먼저 소속 대학교를 선택해주세요.</p>
              )}
              {dmVisibleLevels.map(({ options, i }) => {
                const label = labelForLevel(options, form.double_major_org_unit_path[i]);
                return (
                  <Field key={i} label={label.field.replace("소속 ", "")}>
                    <SelectInput
                      value={form.double_major_org_unit_path[i] ?? ""}
                      disabled={dm.loading && options.length === 0}
                      onChange={(e) => selectDmLevel(i, e.target.value)}
                    >
                      <option value="">
                        {dm.loading && options.length === 0 ? "불러오는 중..." : label.placeholder}
                      </option>
                      {options.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </SelectInput>
                  </Field>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {/* 해외 대학: 텍스트 직접 입력 */}
          <Field label="소속 대학교">
            <TextInput
              value={form.school_name}
              onChange={(e) => update("school_name", e.target.value)}
              placeholder="예: University of Toronto"
            />
          </Field>
          <Field label="소속 학과">
            <TextInput
              value={form.department}
              onChange={(e) => update("department", e.target.value)}
              placeholder="예: Computer Science"
            />
          </Field>
        </>
      )}

      {/* 학년 / 학기 */}
      <Field label="학년 / 학기">
        <SelectInput
          value={academicTermValue}
          onChange={(e) => {
            const selected = ACADEMIC_TERMS.find((term) => term.value === e.target.value);
            updateMultiple({
              academic_year: selected?.year ?? "",
              academic_semester: selected?.semester ?? "",
            });
          }}
        >
          <option value="">선택해주세요</option>
          {ACADEMIC_TERMS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </SelectInput>
      </Field>

      {/* 재학 상태 */}
      <Field label="재학 상태">
        <SelectInput value={form.enrollment_status} onChange={(e) => update("enrollment_status", e.target.value)}>
          <option value="">선택해주세요</option>
          {ENROLLMENT_STATUSES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </SelectInput>
      </Field>

      {/* 학점 */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="누적 학점" optional>
          <TextInput
            type="number"
            value={form.gpa}
            onChange={(e) => update("gpa", e.target.value)}
            placeholder="예: 3.8"
            min="0" max="4.5" step="0.01"
          />
        </Field>
        <Field label="직전 학기 학점" optional>
          <TextInput
            type="number"
            value={form.gpa_last_semester}
            onChange={(e) => update("gpa_last_semester", e.target.value)}
            placeholder="예: 4.1"
            min="0" max="4.5" step="0.01"
          />
        </Field>
      </div>
      <Field label="직전학기 이수학점">
        <TextInput
          type="number"
          value={form.last_semester_earned_credits}
          onChange={(e) => update("last_semester_earned_credits", e.target.value)}
          placeholder="예: 18"
          min="0"
          max="30"
          step="0.5"
        />
      </Field>
      <p className="text-xs text-gray-400 -mt-2">4.5 만점 기준으로 입력해주세요.</p>
    </div>
  );
}

// ── Step 3: 재정/가계 ─────────────────────────────────────────────────────
function Step3({ form, update }: {
  form: OnboardingFormData;
  update: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
}) {
  const householdOptions = [
    { value: "1", label: "1인" }, { value: "2", label: "2인" },
    { value: "3", label: "3인" }, { value: "4", label: "4인" },
    { value: "5", label: "5인 이상" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <Field label="소득분위">
        <SelectInput value={form.income_level} onChange={(e) => update("income_level", e.target.value)}>
          <option value="">선택해주세요</option>
          {INCOME_LEVELS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </SelectInput>
        <p className="text-xs text-gray-400">
          한국장학재단 기준 소득분위입니다. 모르실 경우 &apos;미파악&apos;을 선택하세요.
        </p>
      </Field>
      <Field label="가구원 수" optional>
        <div className="flex flex-wrap gap-2">
          {householdOptions.map(({ value, label }) => (
            <RadioChip key={value} label={label} selected={form.household_size === value}
              onClick={() => update("household_size", form.household_size === value ? "" : value)} />
          ))}
        </div>
      </Field>
    </div>
  );
}

// ── Step 4: 기타/특수 ─────────────────────────────────────────────────────
function Step4({ form, toggleArray, update }: {
  form: OnboardingFormData;
  toggleArray: (field: "special_info" | "parent_occupation", value: string) => void;
  update: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Field label="특수정보" optional>
        <p className="text-xs text-gray-400">해당되는 항목을 모두 선택해주세요.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {SPECIAL_INFO_OPTIONS.map((opt) => (
            <CheckChip key={opt} label={opt} selected={form.special_info.includes(opt)}
              onClick={() => toggleArray("special_info", opt)} />
          ))}
        </div>
      </Field>
      <Field label="부모님 직업" optional>
        <p className="text-xs text-gray-400">해당되는 항목을 모두 선택해주세요.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {PARENT_OCCUPATION_OPTIONS.map((opt) => (
            <CheckChip key={opt} label={opt} selected={form.parent_occupation.includes(opt)}
              onClick={() => toggleArray("parent_occupation", opt)} />
          ))}
        </div>
      </Field>
      <Field label="병역사항" optional>
        <div className="flex flex-wrap gap-2">
          {MILITARY_STATUS_OPTIONS.map((opt) => (
            <RadioChip key={opt} label={opt} selected={form.military_status === opt}
              onClick={() => update("military_status", form.military_status === opt ? "" : opt)} />
          ))}
        </div>
      </Field>
      <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        입력하신 정보는 장학금 매칭에만 활용되며, 외부에 공개되지 않습니다.
      </div>
    </div>
  );
}

// ── 초기값 & 검증 ─────────────────────────────────────────────────────────
const INITIAL_FORM: OnboardingFormData = {
  name: "", birth_year: "", birth_month: "", birth_day: "",
  gender: "", phone: "", address: "", nationality: "", marital_status: "",
  parent_cohabitation: "", parent_address: "",
  school_location: "", school_category: "",
  admission_type: "",
  school_name: "", department: "",
  org_unit_path: [], major_undecided: false, org_unit_is_leaf: false,
  has_double_major: false,
  double_major_org_unit_path: [], double_major_department: "",
  academic_year: "", academic_semester: "", enrollment_status: "", gpa: "", gpa_last_semester: "",
  last_semester_earned_credits: "",
  income_level: "", household_size: "",
  special_info: [], parent_occupation: [], military_status: "",
};

function validateStep(step: number, form: OnboardingFormData): string {
  if (step === 0) {
    if (!form.name.trim()) return "이름을 입력해주세요.";
    if (!form.birth_year || !form.birth_month || !form.birth_day) return "생년월일을 선택해주세요.";
    if (!form.gender) return "성별을 선택해주세요.";
    if (!form.phone) return "연락처를 입력해주세요.";
    if (!form.address) return "주소지를 입력해주세요.";
    if (!form.nationality) return "국적을 선택해주세요.";
    if (!form.parent_cohabitation) return "부모님과 동거 여부를 선택해주세요.";
    if (form.parent_cohabitation === "별거" && !form.parent_address.trim()) return "부모님 주소를 입력해주세요.";
  }
  if (step === 1) {
    if (!form.school_location) return "학교 소재를 선택해주세요.";
    if (!form.school_category) return "학교 유형을 선택해주세요.";
    if (form.school_location === "국내 대학") {
      if (form.org_unit_path.length < 1) return "대학교를 선택해주세요.";
      if (form.org_unit_path.length < 2) return "단과대학을 선택해주세요.";
      // 트리 깊이가 학교마다 달라 org_unit_is_leaf(리프 도달 여부)로 판단한다.
      if (!form.org_unit_is_leaf && !form.major_undecided)
        return "학과를 선택하거나 '아직 정해지지 않았어요'를 체크해주세요.";
    } else {
      if (!form.school_name.trim()) return "소속 대학교를 입력해주세요.";
      if (!form.department.trim()) return "소속 학과를 입력해주세요.";
    }
    if (!form.academic_year) return "학년을 선택해주세요.";
    if (!form.academic_semester) return "학기를 선택해주세요.";
    if (!form.enrollment_status) return "재학 상태를 선택해주세요.";
    if (form.school_location === "국내 대학" && form.has_double_major) {
      if (form.double_major_org_unit_path.length < 1) return "복수전공 단과대학을 선택해주세요.";
      if (form.double_major_org_unit_path.length < 2) return "복수전공 학과를 선택해주세요.";
    }
    if (form.gpa && (parseFloat(form.gpa) < 0 || parseFloat(form.gpa) > 4.5))
      return "누적 학점은 0.0 ~ 4.5 사이로 입력해주세요.";
    if (form.gpa_last_semester && (parseFloat(form.gpa_last_semester) < 0 || parseFloat(form.gpa_last_semester) > 4.5))
      return "직전 학기 학점은 0.0 ~ 4.5 사이로 입력해주세요.";
    const lastSemesterCredits = parseFloat(form.last_semester_earned_credits);
    if (!form.last_semester_earned_credits) return "직전학기 이수학점을 입력해주세요.";
    if (!Number.isFinite(lastSemesterCredits) || lastSemesterCredits < 0 || lastSemesterCredits > 30)
      return "직전학기 이수학점은 0 ~ 30 사이로 입력해주세요.";
  }
  if (step === 2) {
    if (!form.income_level) return "소득분위를 선택해주세요.";
  }
  return "";
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────
export default function OnboardingPageClient({
  headerLogoSrc,
}: {
  headerLogoSrc?: string;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingFormData>(INITIAL_FORM);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [addressModalTarget, setAddressModalTarget] = useState<"address" | "parent_address" | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    loadProfile().then((data) => {
      if (data) {
        setForm(data);
        setIsEditing(true);
      }
      setProfileLoading(false);
    });
  }, []);

  const update = <K extends keyof OnboardingFormData>(
    field: K,
    value: OnboardingFormData[K]
  ) => setForm((prev) => ({ ...prev, [field]: value }));

  const updateMultiple = (updates: Partial<OnboardingFormData>) =>
    setForm((prev) => ({ ...prev, ...updates }));

  const toggleArray = (field: "special_info" | "parent_occupation", value: string) => {
    setForm((prev) => {
      const arr = prev[field] as string[];
      return { ...prev, [field]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  };

  const handleNext = () => {
    const err = validateStep(step, form);
    if (err) { setErrorMsg(err); return; }
    setErrorMsg("");
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    setErrorMsg("");
    setStep((s) => s - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    for (let i = 0; i < STEPS.length; i += 1) {
      const err = validateStep(i, form);
      if (err) {
        setStep(i);
        setErrorMsg(err);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }
    setLoading(true);
    const result = await saveProfile(form, "/matched");
    if (result?.error) { setErrorMsg(result.error); setLoading(false); }
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-white px-4 py-10">
        <div className="mx-auto max-w-lg">
          <div className="mb-8 flex flex-col items-center gap-2 text-center">
            <BrandLogo
              logoSrc={headerLogoSrc}
              className="h-14 max-h-14 max-w-[min(272px,calc(100vw-4rem))] sm:h-16 sm:max-h-16 sm:max-w-[min(300px,calc(100vw-4rem))] md:h-21 md:max-h-21"
              imageClassName="object-contain object-center"
            />
          </div>
          <div className="mb-8 flex items-center justify-center">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center">
                <div className="flex flex-col items-center gap-1">
                  <div className="h-8 w-8 rounded-full bg-gray-100 animate-pulse" />
                  <span className="hidden sm:block h-3 w-10 rounded bg-gray-100 animate-pulse" />
                </div>
                {i < STEPS.length - 1 && <div className="mx-2 mb-4 h-0.5 w-10 bg-gray-200 sm:w-16" />}
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="h-6 w-24 rounded bg-gray-100 animate-pulse mb-6" />
            <div className="space-y-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="space-y-1.5">
                  <div className="h-4 w-16 rounded bg-gray-100 animate-pulse" />
                  <div className="h-10 w-full rounded-lg bg-gray-100 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js" strategy="lazyOnload" />
      {addressModalTarget && (
        <AddressModal
          onSelect={(addr) => update(addressModalTarget, addr)}
          onClose={() => setAddressModalTarget(null)}
        />
      )}

      <div className="min-h-screen bg-white px-4 py-10">
        <div className="mx-auto max-w-lg">
          <div className="mb-8 flex flex-col items-center gap-2 text-center">
            <BrandLogo
              logoSrc={headerLogoSrc}
              className="h-14 max-h-14 max-w-[min(272px,calc(100vw-4rem))] sm:h-16 sm:max-h-16 sm:max-w-[min(300px,calc(100vw-4rem))] md:h-21 md:max-h-21"
              imageClassName="object-contain object-center"
            />
            {isEditing ? (
              <p className="text-sm text-ink/60">수정할 정보를 변경한 뒤 저장해주세요.</p>
            ) : (
              <p className="text-sm text-ink/60">프로필을 완성하면 맞춤 장학금을 추천해드립니다.</p>
            )}
          </div>

          <StepIndicator current={step} steps={STEPS} />

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="mb-6 text-lg font-bold text-ink">{STEPS[step]}</h2>

            {step === 0 && (
              <Step1
                form={form}
                update={update}
                openAddress={() => setAddressModalTarget("address")}
                openParentAddress={() => setAddressModalTarget("parent_address")}
              />
            )}
            {step === 1 && (
              <Step2 form={form} update={update} updateMultiple={updateMultiple} />
            )}
            {step === 2 && <Step3 form={form} update={update} />}
            {step === 3 && <Step4 form={form} toggleArray={toggleArray} update={update} />}

            {errorMsg && (
              <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <div className="mt-8 flex gap-3">
              {step > 0 && (
                <button type="button" onClick={handleBack}
                  className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-ink/70 transition hover:bg-gray-50">
                  이전
                </button>
              )}
              {step < STEPS.length - 1 ? (
                <button type="button" onClick={handleNext}
                  className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90">
                  다음
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} disabled={loading}
                  className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? "저장 중..." : isEditing ? "프로필 저장하기" : "프로필 완성하기"}
                </button>
              )}
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-ink/40">{step + 1} / {STEPS.length} 단계</p>
        </div>
      </div>
    </>
  );
}
