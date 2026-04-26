"use client";

import { useState, useEffect, useRef } from "react";
import Script from "next/script";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadProfile, saveProfile, type OnboardingFormData } from "./actions";

// ?€?€ Kakao Postcode ?€???€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
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

// ?€?€ ì£¼ì†Œ ê²€??ëª¨ë‹¬ ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
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
          <h3 className="text-sm font-semibold text-gray-900">ì£¼ì†Œ ê²€??/h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">??/button>
        </div>
        <div ref={containerRef} style={{ height: 460 }} />
      </div>
    </div>
  );
}

// ?€?€ ?ìˆ˜ ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 1949 }, (_, i) => String(THIS_YEAR - 18 - i));
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));

const SCHOOL_CATEGORIES = ["4?„ì œ", "?„ë¬¸?€", "?€?™ì›", "?¬ì´ë²„ë?", "ë°©í†µ?€"];
const ENROLLMENT_STATUSES = ["? ì…??, "?¬í•™", "?´í•™", "ì´ˆê³¼?™ê¸°", "?˜ë£Œ", "ì¡¸ì—…? ì˜ˆ", "ì¡¸ì—…"];
const ACADEMIC_YEARS = [
  { value: "1", label: "1?™ë…„" }, { value: "2", label: "2?™ë…„" },
  { value: "3", label: "3?™ë…„" }, { value: "4", label: "4?™ë…„" },
  { value: "5", label: "ì´ˆê³¼?™ê¸° ?´ìƒ" },
];
const INCOME_LEVELS = [
  { value: "0", label: "0êµ¬ê°„ (ê¸°ì´ˆ/ì°¨ìƒ??" },
  ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}êµ¬ê°„` })),
  { value: "unknown", label: "ë¯¸íŒŒ?? },
];
const SPECIAL_INFO_OPTIONS = [
  "?¤ë¬¸?”ê???, "ê¸°ì´ˆ?í™œ?˜ê¸‰??, "ì°¨ìƒ?„ê³„ì¸?, "?¥ì• ??, "?ˆí„°ë¯?,
  "?ì–´ì´Œì?€", "ë³´í›ˆ?€?ì", "ì¡°ë?ëª¨ê???, "?¤ì?€", "?œë?ëª¨ê???,
  "?™ìƒê°€??, "ë¶í•œ?´íƒˆì£¼ë?", "?ë¦½ì¤€ë¹„ì²­??,
];
const PARENT_OCCUPATION_OPTIONS = [
  "ì§ì—…êµ°ì¸", "êµ°ë¬´??, "?ì¶•?´ì—…??, "ê±´ì„¤ê·¼ë¡œ??, "?Œìƒê³µì¸",
  "ê²½ì°°/?Œë°©ê´€", "?ë°°ê¸°ì‚¬", "?˜ê²½ë¯¸í™”??, "?°ê·¹??,
];
const MILITARY_STATUS_OPTIONS = ["êµ°í•„", "ë¯¸í•„", "ë¹„ë???, "ë©´ì œ"];
const STEPS = ["?¸ì ?¬í•­", "?™ì ?¬í•­", "?¬ì •/ê°€ê³?, "ê¸°í?/?¹ìˆ˜"];

// ?€?€ ? í‹¸ ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

// ?€?€ ê³µí†µ ì»´í¬?ŒíŠ¸ ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
function Field({ label, optional = false, children }: {
  label: string; optional?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
        {label}
        {optional && <span className="text-xs font-normal text-gray-400">? íƒ</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-peach focus:ring-2 focus:ring-[#fea276]/20 disabled:bg-gray-50 disabled:text-gray-400"
    />
  );
}

function SelectInput({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full cursor-pointer appearance-none rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-peach focus:ring-2 focus:ring-[#fea276]/20 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
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
          ? "border-brand bg-brand text-white"
          : "border-gray-200 bg-white text-gray-600 hover:border-peach hover:text-brand"
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

// ?€?€ ?¤í… ?¸ë””ì¼€?´í„° ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="mb-8 flex items-center justify-center">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all ${
              i < current ? "bg-brand text-white"
              : i === current ? "bg-brand text-white ring-4 ring-brand/20"
              : "bg-gray-100 text-gray-400"
            }`}>
              {i < current ? "?? : i + 1}
            </div>
            <span className={`hidden text-xs font-medium sm:block ${
              i === current ? "text-brand" : i < current ? "text-gray-600" : "text-gray-400"
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

// ?€?€ Step 1: ?¸ì ?¬í•­ ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
function Step1({ form, update, openAddress }: {
  form: OnboardingFormData;
  update: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
  openAddress: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="?´ë¦„">
        <TextInput value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="?ê¸¸?? />
      </Field>

      <Field label="?ë…„?”ì¼">
        <div className="flex gap-2">
          <SelectInput value={form.birth_year} onChange={(e) => update("birth_year", e.target.value)}>
            <option value="">?„ë„</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}??/option>)}
          </SelectInput>
          <SelectInput value={form.birth_month} onChange={(e) => update("birth_month", e.target.value)}>
            <option value="">??/option>
            {MONTHS.map((m) => <option key={m} value={m}>{m}??/option>)}
          </SelectInput>
          <SelectInput value={form.birth_day} onChange={(e) => update("birth_day", e.target.value)}>
            <option value="">??/option>
            {DAYS.map((d) => <option key={d} value={d}>{d}??/option>)}
          </SelectInput>
        </div>
      </Field>

      <Field label="?±ë³„">
        <div className="flex gap-2">
          {["?¨ì„±", "?¬ì„±"].map((g) => (
            <RadioChip key={g} label={g} selected={form.gender === g} onClick={() => update("gender", g)} />
          ))}
        </div>
      </Field>

      <Field label="?°ë½ì²?>
        <TextInput
          type="tel"
          value={form.phone}
          onChange={(e) => update("phone", formatPhone(e.target.value))}
          placeholder="010-0000-0000"
          maxLength={13}
        />
      </Field>

      <Field label="ì£¼ì†Œì§€">
        <div className="flex gap-2">
          <TextInput value={form.address} readOnly placeholder="ê²€??ë²„íŠ¼???ŒëŸ¬ ì£¼ì†Œë¥?? íƒ?´ì£¼?¸ìš”" />
          <button
            type="button"
            onClick={openAddress}
            className="shrink-0 rounded-lg border border-[#fea276]/60 px-4 py-2.5 text-sm font-medium text-brand transition hover:bg-[#fbeca8]"
          >
            ê²€??
          </button>
        </div>
      </Field>

      <Field label="êµ? ">
        <div className="flex gap-2">
          {["?´êµ­??, "?¸êµ­??].map((n) => (
            <RadioChip key={n} label={n} selected={form.nationality === n} onClick={() => update("nationality", n)} />
          ))}
        </div>
      </Field>

      <Field label="ê¸°í˜¼ ?¬ë?" optional>
        <div className="flex gap-2">
          {["ë¯¸í˜¼", "ê¸°í˜¼"].map((m) => (
            <RadioChip key={m} label={m} selected={form.marital_status === m}
              onClick={() => update("marital_status", form.marital_status === m ? "" : m)} />
          ))}
        </div>
      </Field>
    </div>
  );
}

// ?€?€ Step 2: ?™ì ?¬í•­ (ê³„ì¸µ??? íƒ) ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
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

  // êµ?‚´ ?€??? íƒ ???€?™êµ ëª©ë¡ ë¡œë“œ
  useEffect(() => {
    if (form.school_location !== "êµ?‚´ ?€??) return;
    setLoadingU(true);
    createClient()
      .from("universities")
      .select("id, name")
      .order("name")
      .then(({ data }) => { setUniversities(data ?? []); setLoadingU(false); });
  }, [form.school_location]);

  // ?€?™êµ ? íƒ ???¨ê³¼?€ ëª©ë¡ ë¡œë“œ
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

  // ?¨ê³¼?€ ? íƒ ???™ê³¼ ëª©ë¡ ë¡œë“œ (ë³¸ì „ê³?
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

  // ë³µìˆ˜?„ê³µ ?¨ê³¼?€ ? íƒ ???™ê³¼ ëª©ë¡ ë¡œë“œ
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

  const isKorean = form.school_location === "êµ?‚´ ?€??;

  return (
    <div className="flex flex-col gap-5">
      {/* ?™êµ ?Œì¬ */}
      <Field label="?™êµ ?Œì¬">
        <div className="flex gap-2">
          {["êµ?‚´ ?€??, "?´ì™¸ ?€??].map((l) => (
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

      {/* ?™êµ ? í˜• */}
      <Field label="?™êµ ? í˜•">
        <SelectInput value={form.school_category} onChange={(e) => update("school_category", e.target.value)}>
          <option value="">? íƒ?´ì£¼?¸ìš”</option>
          {SCHOOL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectInput>
      </Field>

      {isKorean ? (
        <>
          {/* ???€?™êµ */}
          <Field label="?Œì† ?€?™êµ">
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
              <option value="">{loadingU ? "ë¶ˆëŸ¬?¤ëŠ” ì¤?.." : "?€?™êµ ? íƒ"}</option>
              {universities.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </SelectInput>
          </Field>

          {/* ???¨ê³¼?€??*/}
          <Field label="?Œì† ?¨ê³¼?€??>
            <SelectInput
              value={form.college_id}
              disabled={!form.university_id || loadingC}
              onChange={(e) => {
                updateMultiple({ college_id: e.target.value, department_id: "", department: "" });
              }}
            >
              <option value="">
                {!form.university_id ? "ë¨¼ì? ?€?™êµë¥?? íƒ?´ì£¼?¸ìš”" : loadingC ? "ë¶ˆëŸ¬?¤ëŠ” ì¤?.." : "?¨ê³¼?€??? íƒ"}
              </option>
              {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectInput>
          </Field>

          {/* ???™ê³¼ (ë³¸ì „ê³? */}
          <Field label="?Œì† ?™ê³¼ (ë³¸ì „ê³?">
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
                {!form.college_id ? "ë¨¼ì? ?¨ê³¼?€?™ì„ ? íƒ?´ì£¼?¸ìš”" : loadingD ? "ë¶ˆëŸ¬?¤ëŠ” ì¤?.." : "?™ê³¼ ? íƒ"}
              </option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </SelectInput>
          </Field>

          {/* ë³µìˆ˜?„ê³µ ? ê? */}
          <Field label="ë³µìˆ˜(?´ì¤‘/ë¶€)?„ê³µ" optional>
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
                {form.has_double_major ? "?ˆìŒ" : "?†ìŒ"}
              </span>
            </div>
          </Field>

          {/* ë³µìˆ˜?„ê³µ ?ì„¸ */}
          {form.has_double_major && (
            <div className="flex flex-col gap-4 rounded-xl border border-[#fea276]/30 bg-[#fbeca8]/40 p-4">
              <p className="text-xs font-semibold text-brand">???„ê³µ ?•ë³´</p>

              <Field label="?¨ê³¼?€??>
                <SelectInput
                  value={form.double_major_college_id}
                  disabled={!form.university_id}
                  onChange={(e) => updateMultiple({
                    double_major_college_id: e.target.value,
                    double_major_department_id: "",
                    double_major_department: "",
                  })}
                >
                  <option value="">?¨ê³¼?€??? íƒ</option>
                  {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectInput>
              </Field>

              <Field label="?™ê³¼">
                <SelectInput
                  value={form.double_major_department_id}
                  disabled={!form.double_major_college_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    const name = doubleDepts.find((d) => String(d.id) === id)?.name ?? "";
                    updateMultiple({ double_major_department_id: id, double_major_department: name });
                  }}
                >
                  <option value="">?™ê³¼ ? íƒ</option>
                  {doubleDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </SelectInput>
              </Field>
            </div>
          )}
        </>
      ) : (
        <>
          {/* ?´ì™¸ ?€?? ?ìŠ¤??ì§ì ‘ ?…ë ¥ */}
          <Field label="?Œì† ?€?™êµ">
            <TextInput
              value={form.school_name}
              onChange={(e) => update("school_name", e.target.value)}
              placeholder="?? University of Toronto"
            />
          </Field>
          <Field label="?Œì† ?™ê³¼">
            <TextInput
              value={form.department}
              onChange={(e) => update("department", e.target.value)}
              placeholder="?? Computer Science"
            />
          </Field>
        </>
      )}

      {/* ?™ë…„ / ?™ê¸° */}
      <Field label="?™ë…„ / ?™ê¸°">
        <div className="flex gap-2">
          <SelectInput value={form.academic_year} onChange={(e) => update("academic_year", e.target.value)}>
            <option value="">?™ë…„</option>
            {ACADEMIC_YEARS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </SelectInput>
          <SelectInput value={form.academic_semester} onChange={(e) => update("academic_semester", e.target.value)}>
            <option value="">?™ê¸°</option>
            <option value="1">1?™ê¸°</option>
            <option value="2">2?™ê¸°</option>
          </SelectInput>
        </div>
      </Field>

      {/* ?¬í•™ ?íƒœ */}
      <Field label="?¬í•™ ?íƒœ">
        <SelectInput value={form.enrollment_status} onChange={(e) => update("enrollment_status", e.target.value)}>
          <option value="">? íƒ?´ì£¼?¸ìš”</option>
          {ENROLLMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </SelectInput>
      </Field>

      {/* ?™ì  */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="?„ì  ?™ì " optional>
          <TextInput
            type="number"
            value={form.gpa}
            onChange={(e) => update("gpa", e.target.value)}
            placeholder="?? 3.8"
            min="0" max="4.5" step="0.01"
          />
        </Field>
        <Field label="ì§ì „ ?™ê¸° ?™ì " optional>
          <TextInput
            type="number"
            value={form.gpa_last_semester}
            onChange={(e) => update("gpa_last_semester", e.target.value)}
            placeholder="?? 4.1"
            min="0" max="4.5" step="0.01"
          />
        </Field>
      </div>
      <p className="text-xs text-gray-400 -mt-2">4.5 ë§Œì  ê¸°ì??¼ë¡œ ?…ë ¥?´ì£¼?¸ìš”.</p>
    </div>
  );
}

// ?€?€ Step 3: ?¬ì •/ê°€ê³??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
function Step3({ form, update }: {
  form: OnboardingFormData;
  update: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
}) {
  const householdOptions = [
    { value: "1", label: "1?? }, { value: "2", label: "2?? },
    { value: "3", label: "3?? }, { value: "4", label: "4?? },
    { value: "5", label: "5???´ìƒ" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <Field label="?Œë“ë¶„ìœ„">
        <SelectInput value={form.income_level} onChange={(e) => update("income_level", e.target.value)}>
          <option value="">? íƒ?´ì£¼?¸ìš”</option>
          {INCOME_LEVELS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </SelectInput>
        <p className="text-xs text-gray-400">
          ?œêµ­?¥í•™?¬ë‹¨ ê¸°ì? ?Œë“ë¶„ìœ„?…ë‹ˆ?? ëª¨ë¥´??ê²½ìš° &apos;ë¯¸íŒŒ??apos;??? íƒ?˜ì„¸??
        </p>
      </Field>
      <Field label="ê°€êµ¬ì› ?? optional>
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

// ?€?€ Step 4: ê¸°í?/?¹ìˆ˜ ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
function Step4({ form, toggleArray, update }: {
  form: OnboardingFormData;
  toggleArray: (field: "special_info" | "parent_occupation", value: string) => void;
  update: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Field label="?¹ìˆ˜?•ë³´" optional>
        <p className="text-xs text-gray-400">?´ë‹¹?˜ëŠ” ??ª©??ëª¨ë‘ ? íƒ?´ì£¼?¸ìš”.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {SPECIAL_INFO_OPTIONS.map((opt) => (
            <CheckChip key={opt} label={opt} selected={form.special_info.includes(opt)}
              onClick={() => toggleArray("special_info", opt)} />
          ))}
        </div>
      </Field>
      <Field label="ë¶€ëª¨ë‹˜ ì§ì—…" optional>
        <p className="text-xs text-gray-400">?´ë‹¹?˜ëŠ” ??ª©??ëª¨ë‘ ? íƒ?´ì£¼?¸ìš”.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {PARENT_OCCUPATION_OPTIONS.map((opt) => (
            <CheckChip key={opt} label={opt} selected={form.parent_occupation.includes(opt)}
              onClick={() => toggleArray("parent_occupation", opt)} />
          ))}
        </div>
      </Field>
      <Field label="ë³‘ì—­?¬í•­" optional>
        <div className="flex flex-wrap gap-2">
          {MILITARY_STATUS_OPTIONS.map((opt) => (
            <RadioChip key={opt} label={opt} selected={form.military_status === opt}
              onClick={() => update("military_status", form.military_status === opt ? "" : opt)} />
          ))}
        </div>
      </Field>
      <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        ?…ë ¥?˜ì‹  ?•ë³´???¥í•™ê¸?ë§¤ì¹­?ë§Œ ?œìš©?˜ë©°, ?¸ë???ê³µê°œ?˜ì? ?ŠìŠµ?ˆë‹¤.
      </div>
    </div>
  );
}

// ?€?€ ì´ˆê¸°ê°?& ê²€ì¦??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
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
    if (!form.name.trim()) return "?´ë¦„???…ë ¥?´ì£¼?¸ìš”.";
    if (!form.birth_year || !form.birth_month || !form.birth_day) return "?ë…„?”ì¼??? íƒ?´ì£¼?¸ìš”.";
    if (!form.gender) return "?±ë³„??? íƒ?´ì£¼?¸ìš”.";
    if (!form.phone) return "?°ë½ì²˜ë? ?…ë ¥?´ì£¼?¸ìš”.";
    if (!form.address) return "ì£¼ì†Œì§€ë¥??…ë ¥?´ì£¼?¸ìš”.";
    if (!form.nationality) return "êµ? ??? íƒ?´ì£¼?¸ìš”.";
  }
  if (step === 1) {
    if (!form.school_location) return "?™êµ ?Œì¬ë¥?? íƒ?´ì£¼?¸ìš”.";
    if (!form.school_category) return "?™êµ ? í˜•??? íƒ?´ì£¼?¸ìš”.";
    if (form.school_location === "êµ?‚´ ?€??) {
      if (!form.university_id) return "?€?™êµë¥?? íƒ?´ì£¼?¸ìš”.";
      if (!form.college_id) return "?¨ê³¼?€?™ì„ ? íƒ?´ì£¼?¸ìš”.";
      if (!form.department_id) return "?™ê³¼ë¥?? íƒ?´ì£¼?¸ìš”.";
    } else {
      if (!form.school_name.trim()) return "?Œì† ?€?™êµë¥??…ë ¥?´ì£¼?¸ìš”.";
      if (!form.department.trim()) return "?Œì† ?™ê³¼ë¥??…ë ¥?´ì£¼?¸ìš”.";
    }
    if (!form.academic_year) return "?™ë…„??? íƒ?´ì£¼?¸ìš”.";
    if (!form.academic_semester) return "?™ê¸°ë¥?? íƒ?´ì£¼?¸ìš”.";
    if (!form.enrollment_status) return "?¬í•™ ?íƒœë¥?? íƒ?´ì£¼?¸ìš”.";
    if (form.gpa && (parseFloat(form.gpa) < 0 || parseFloat(form.gpa) > 4.5))
      return "?„ì  ?™ì ?€ 0.0 ~ 4.5 ?¬ì´ë¡??…ë ¥?´ì£¼?¸ìš”.";
    if (form.gpa_last_semester && (parseFloat(form.gpa_last_semester) < 0 || parseFloat(form.gpa_last_semester) > 4.5))
      return "ì§ì „ ?™ê¸° ?™ì ?€ 0.0 ~ 4.5 ?¬ì´ë¡??…ë ¥?´ì£¼?¸ìš”.";
  }
  if (step === 2) {
    if (!form.income_level) return "?Œë“ë¶„ìœ„ë¥?? íƒ?´ì£¼?¸ìš”.";
  }
  return "";
}

// ?€?€ ë©”ì¸ ?˜ì´ì§€ ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingFormData>(INITIAL_FORM);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
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
    setLoading(true);
    const result = await saveProfile(form, isEditing ? "/matched" : "/");
    if (result?.error) { setErrorMsg(result.error); setLoading(false); }
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto max-w-lg">
          <div className="mb-8 flex flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
                <span className="text-base font-bold text-white">K</span>
              </div>
              <span className="text-xl font-bold tracking-tight text-gray-900">ì¿ ë„¥??/span>
            </div>
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
              <span className="text-xl font-bold tracking-tight text-gray-900">ì¿ ë„¥??/span>
            </Link>
            {isEditing ? (
              <p className="text-sm text-gray-500">?˜ì •???•ë³´ë¥?ë³€ê²½í•œ ???€?¥í•´ì£¼ì„¸??</p>
            ) : (
              <p className="text-sm text-gray-500">?„ë¡œ?„ì„ ?„ì„±?˜ë©´ ë§ì¶¤ ?¥í•™ê¸ˆì„ ì¶”ì²œ?´ë“œë¦½ë‹ˆ??</p>
            )}
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
                  ?´ì „
                </button>
              )}
              {step < STEPS.length - 1 ? (
                <button type="button" onClick={handleNext}
                  className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand/85">
                  ?¤ìŒ
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} disabled={loading}
                  className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand/85 disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? "?€??ì¤?.." : isEditing ? "?„ë¡œ???€?¥í•˜ê¸? : "?„ë¡œ???„ì„±?˜ê¸°"}
                </button>
              )}
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-gray-400">{step + 1} / {STEPS.length} ?¨ê³„</p>
        </div>
      </div>
    </>
  );
}
