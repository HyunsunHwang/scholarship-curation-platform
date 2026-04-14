"use client";

import { useState, useEffect, useRef } from "react";
import Script from "next/script";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { saveProfile, type OnboardingFormData } from "./actions";

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
const ENROLLMENT_STATUSES = ["신입학", "재학", "휴학", "초과학기", "수료", "졸업유예", "졸업"];
const ACADEMIC_YEARS = [
  { value: "1", label: "1학년" }, { value: "2", label: "2학년" },
  { value: "3", label: "3학년" }, { value: "4", label: "4학년" },
  { value: "5", label: "초과학기 이상" },
];
const INCOME_LEVELS = [
  { value: "0", label: "0구간 (기초/차상위)" },
  ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}구간` })),
  { value: "unknown", label: "미파악" },
];
const SPECIAL_INFO_OPTIONS = [
  "다문화가정", "기초생활수급자", "차상위계층", "장애인", "새터민",
  "농어촌자녀", "보훈대상자", "조부모가정", "다자녀", "한부모가정",
  "학생가장", "북한이탈주민", "자립준비청년",
];
const PARENT_OCCUPATION_OPTIONS = [
  "직업군인", "군무원", "농축어업인", "건설근로자", "소상공인",
  "경찰/소방관", "택배기사", "환경미화원", "연극인",
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
      className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-gray-50 disabled:text-gray-400"
    />
  );
}

function SelectInput({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full cursor-pointer appearance-none rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
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
          ? "border-indigo-600 bg-indigo-50 text-indigo-700"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
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
          ? "border-indigo-600 bg-indigo-600 text-white"
          : "border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
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
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? "bg-indigo-600" : "bg-gray-200"}`}
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
              i < current ? "bg-indigo-600 text-white"
              : i === current ? "bg-indigo-600 text-white ring-4 ring-indigo-100"
              : "bg-gray-100 text-gray-400"
            }`}>
              {i < current ? "✓" : i + 1}
            </div>
            <span className={`hidden text-xs font-medium sm:block ${
              i === current ? "text-indigo-600" : i < current ? "text-gray-600" : "text-gray-400"
            }`}>{step}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`mx-2 mb-4 h-0.5 w-10 transition-all sm:w-16 ${i < current ? "bg-indigo-600" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: 인적사항 ──────────────────────────────────────────────────────
function Step1({ form, update, openAddress }: {
  form: OnboardingFormData;
  update: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
  openAddress: () => void;
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
            className="shrink-0 rounded-lg border border-indigo-200 px-4 py-2.5 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50"
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
    </div>
  );
}

// ── Step 2: 학적사항 (계층형 선택) ───────────────────────────────────────
type PickItem = { id: number; name: string };

function Step2({ form, update, updateMultiple }: {
  form: OnboardingFormData;
  update: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
  updateMultiple: (updates: Partial<OnboardingFormData>) => void;
}) {
  const [universities, setUniversities] = useState<PickItem[]>([]);
  const [colleges, setColleges] = useState<PickItem[]>([]);
  const [departments, setDepartments] = useState<PickItem[]>([]);
  const [doubleDepts, setDoubleDepts] = useState<PickItem[]>([]);
  const [loadingU, setLoadingU] = useState(false);
  const [loadingC, setLoadingC] = useState(false);
  const [loadingD, setLoadingD] = useState(false);

  // 국내 대학 선택 시 대학교 목록 로드
  useEffect(() => {
    if (form.school_location !== "국내 대학") return;
    setLoadingU(true);
    createClient()
      .from("universities")
      .select("id, name")
      .order("name")
      .then(({ data }) => { setUniversities(data ?? []); setLoadingU(false); });
  }, [form.school_location]);

  // 대학교 선택 시 단과대 목록 로드
  useEffect(() => {
    setColleges([]);
    if (!form.university_id) return;
    setLoadingC(true);
    createClient()
      .from("university_colleges")
      .select("id, name")
      .eq("university_id", parseInt(form.university_id))
      .order("name")
      .then(({ data }) => { setColleges(data ?? []); setLoadingC(false); });
  }, [form.university_id]);

  // 단과대 선택 시 학과 목록 로드 (본전공)
  useEffect(() => {
    setDepartments([]);
    if (!form.college_id) return;
    setLoadingD(true);
    createClient()
      .from("university_departments")
      .select("id, name")
      .eq("college_id", parseInt(form.college_id))
      .order("name")
      .then(({ data }) => { setDepartments(data ?? []); setLoadingD(false); });
  }, [form.college_id]);

  // 복수전공 단과대 선택 시 학과 목록 로드
  useEffect(() => {
    setDoubleDepts([]);
    if (!form.double_major_college_id) return;
    createClient()
      .from("university_departments")
      .select("id, name")
      .eq("college_id", parseInt(form.double_major_college_id))
      .order("name")
      .then(({ data }) => setDoubleDepts(data ?? []));
  }, [form.double_major_college_id]);

  const isKorean = form.school_location === "국내 대학";

  return (
    <div className="flex flex-col gap-5">
      {/* 학교 소재 */}
      <Field label="학교 소재">
        <div className="flex gap-2">
          {["국내 대학", "해외 대학"].map((l) => (
            <RadioChip key={l} label={l} selected={form.school_location === l}
              onClick={() => updateMultiple({
                school_location: l,
                university_id: "", school_name: "",
                college_id: "", department_id: "", department: "",
                has_double_major: false,
                double_major_college_id: "", double_major_department_id: "", double_major_department: "",
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

      {isKorean ? (
        <>
          {/* ① 대학교 */}
          <Field label="소속 대학교">
            <SelectInput
              value={form.university_id}
              disabled={loadingU}
              onChange={(e) => {
                const id = e.target.value;
                const name = universities.find((u) => String(u.id) === id)?.name ?? "";
                updateMultiple({
                  university_id: id, school_name: name,
                  college_id: "", department_id: "", department: "",
                  double_major_college_id: "", double_major_department_id: "", double_major_department: "",
                });
              }}
            >
              <option value="">{loadingU ? "불러오는 중..." : "대학교 선택"}</option>
              {universities.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </SelectInput>
          </Field>

          {/* ② 단과대학 */}
          <Field label="소속 단과대학">
            <SelectInput
              value={form.college_id}
              disabled={!form.university_id || loadingC}
              onChange={(e) => {
                updateMultiple({ college_id: e.target.value, department_id: "", department: "" });
              }}
            >
              <option value="">
                {!form.university_id ? "먼저 대학교를 선택해주세요" : loadingC ? "불러오는 중..." : "단과대학 선택"}
              </option>
              {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectInput>
          </Field>

          {/* ③ 학과 (본전공) */}
          <Field label="소속 학과 (본전공)">
            <SelectInput
              value={form.department_id}
              disabled={!form.college_id || loadingD}
              onChange={(e) => {
                const id = e.target.value;
                const name = departments.find((d) => String(d.id) === id)?.name ?? "";
                updateMultiple({ department_id: id, department: name });
              }}
            >
              <option value="">
                {!form.college_id ? "먼저 단과대학을 선택해주세요" : loadingD ? "불러오는 중..." : "학과 선택"}
              </option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </SelectInput>
          </Field>

          {/* 복수전공 토글 */}
          <Field label="복수(이중/부)전공" optional>
            <div className="flex items-center gap-3">
              <Toggle
                on={form.has_double_major}
                onClick={() => {
                  const next = !form.has_double_major;
                  updateMultiple({
                    has_double_major: next,
                    ...(!next && {
                      double_major_college_id: "",
                      double_major_department_id: "",
                      double_major_department: "",
                    }),
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
            <div className="flex flex-col gap-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
              <p className="text-xs font-semibold text-indigo-700">제2전공 정보</p>

              <Field label="단과대학">
                <SelectInput
                  value={form.double_major_college_id}
                  disabled={!form.university_id}
                  onChange={(e) => updateMultiple({
                    double_major_college_id: e.target.value,
                    double_major_department_id: "",
                    double_major_department: "",
                  })}
                >
                  <option value="">단과대학 선택</option>
                  {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectInput>
              </Field>

              <Field label="학과">
                <SelectInput
                  value={form.double_major_department_id}
                  disabled={!form.double_major_college_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    const name = doubleDepts.find((d) => String(d.id) === id)?.name ?? "";
                    updateMultiple({ double_major_department_id: id, double_major_department: name });
                  }}
                >
                  <option value="">학과 선택</option>
                  {doubleDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </SelectInput>
              </Field>
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
        <div className="flex gap-2">
          <SelectInput value={form.academic_year} onChange={(e) => update("academic_year", e.target.value)}>
            <option value="">학년</option>
            {ACADEMIC_YEARS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </SelectInput>
          <SelectInput value={form.academic_semester} onChange={(e) => update("academic_semester", e.target.value)}>
            <option value="">학기</option>
            <option value="1">1학기</option>
            <option value="2">2학기</option>
          </SelectInput>
        </div>
      </Field>

      {/* 재학 상태 */}
      <Field label="재학 상태">
        <SelectInput value={form.enrollment_status} onChange={(e) => update("enrollment_status", e.target.value)}>
          <option value="">선택해주세요</option>
          {ENROLLMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
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
  school_location: "", school_category: "",
  school_name: "", department: "",
  university_id: "", college_id: "", department_id: "",
  has_double_major: false,
  double_major_college_id: "", double_major_department_id: "", double_major_department: "",
  academic_year: "", academic_semester: "", enrollment_status: "", gpa: "", gpa_last_semester: "",
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
  }
  if (step === 1) {
    if (!form.school_location) return "학교 소재를 선택해주세요.";
    if (!form.school_category) return "학교 유형을 선택해주세요.";
    if (form.school_location === "국내 대학") {
      if (!form.university_id) return "대학교를 선택해주세요.";
      if (!form.college_id) return "단과대학을 선택해주세요.";
      if (!form.department_id) return "학과를 선택해주세요.";
    } else {
      if (!form.school_name.trim()) return "소속 대학교를 입력해주세요.";
      if (!form.department.trim()) return "소속 학과를 입력해주세요.";
    }
    if (!form.academic_year) return "학년을 선택해주세요.";
    if (!form.academic_semester) return "학기를 선택해주세요.";
    if (!form.enrollment_status) return "재학 상태를 선택해주세요.";
    if (form.gpa && (parseFloat(form.gpa) < 0 || parseFloat(form.gpa) > 4.5))
      return "누적 학점은 0.0 ~ 4.5 사이로 입력해주세요.";
    if (form.gpa_last_semester && (parseFloat(form.gpa_last_semester) < 0 || parseFloat(form.gpa_last_semester) > 4.5))
      return "직전 학기 학점은 0.0 ~ 4.5 사이로 입력해주세요.";
  }
  if (step === 2) {
    if (!form.income_level) return "소득분위를 선택해주세요.";
  }
  return "";
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingFormData>(INITIAL_FORM);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);

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
    setLoading(true);
    const result = await saveProfile(form);
    if (result?.error) { setErrorMsg(result.error); setLoading(false); }
  };

  return (
    <>
      <Script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js" strategy="lazyOnload" />
      {showAddressModal && (
        <AddressModal
          onSelect={(addr) => update("address", addr)}
          onClose={() => setShowAddressModal(false)}
        />
      )}

      <div className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto max-w-lg">
          <div className="mb-8 flex flex-col items-center gap-2 text-center">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
                <span className="text-base font-bold text-white">K</span>
              </div>
              <span className="text-xl font-bold tracking-tight text-gray-900">쿠넥트</span>
            </Link>
            <p className="text-sm text-gray-500">프로필을 완성하면 맞춤 장학금을 추천해드립니다.</p>
          </div>

          <StepIndicator current={step} steps={STEPS} />

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="mb-6 text-lg font-bold text-gray-900">{STEPS[step]}</h2>

            {step === 0 && (
              <Step1 form={form} update={update} openAddress={() => setShowAddressModal(true)} />
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
                  className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50">
                  이전
                </button>
              )}
              {step < STEPS.length - 1 ? (
                <button type="button" onClick={handleNext}
                  className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700">
                  다음
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} disabled={loading}
                  className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? "저장 중..." : "프로필 완성하기"}
                </button>
              )}
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-gray-400">{step + 1} / {STEPS.length} 단계</p>
        </div>
      </div>
    </>
  );
}
