"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ENROLLMENT_STATUS_OPTIONS,
  JOB_CATEGORY_OPTIONS,
  SCHOOL_CATEGORY_OPTIONS,
  YEAR_OPTIONS,
} from "@/lib/corporate/talent-params";
import {
  INTEREST_SUBCATEGORIES,
  categoryOfInterestJob,
  interestCategoryLabel,
  interestJobLabel,
  isInterestCategoryId,
  isInterestJobId,
  type InterestCategoryId,
} from "@/lib/interestCategories";
import { INTEREST_INDUSTRIES } from "@/lib/interestIndustries";
import { SKILL_CATALOG } from "@/lib/skills";

const chipBase =
  "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors";
const chipIdle =
  "border-gray-200 bg-white text-ink/70 hover:border-brand/40 hover:text-brand";
const chipActive = "border-brand bg-brand/10 text-brand";

type SectionId =
  | "jobs"
  | "workStatus"
  | "industries"
  | "skills"
  | "year"
  | "status"
  | "school";

/** 선택 요약 칩 (사이드바에 항상 노출, 클릭 시 제거) */
type SummaryChip = { key: string; label: string; onRemove: () => void };

function FlyoutSection({
  title,
  activeCount,
  open,
  onToggle,
  onClose,
  onReset,
  summaryChips,
  children,
}: {
  title: string;
  activeCount: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onReset?: () => void;
  summaryChips: SummaryChip[];
  children: React.ReactNode;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!sectionRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={sectionRef} className="relative border-b border-gray-100 py-3 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex w-full items-center justify-between"
      >
        <span className="text-sm font-semibold text-ink">
          {title}
          {activeCount > 0 ? (
            <span className="ml-1.5 rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand">
              {activeCount}
            </span>
          ) : null}
        </span>
        <span
          className={`text-ink/40 transition-transform ${open ? "rotate-45" : ""}`}
        >
          +
        </span>
      </button>

      {summaryChips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {summaryChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onRemove}
              className={`${chipBase} ${chipActive}`}
              title="클릭하여 제거"
            >
              {chip.label} ×
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <div
          role="dialog"
          aria-label={`${title} 선택`}
          className="fixed inset-x-4 top-24 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-xl lg:absolute lg:inset-x-auto lg:left-full lg:top-0 lg:ml-4 lg:w-md lg:max-h-128"
        >
          <div className="flex items-center justify-between pb-3">
            <p className="text-base font-bold text-ink">{title}</p>
            <div className="flex items-center gap-3">
              {activeCount > 0 && onReset ? (
                <button
                  type="button"
                  onClick={onReset}
                  className="text-xs font-medium text-ink/50 hover:text-brand"
                >
                  초기화
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="text-lg leading-none text-ink/40 hover:text-ink"
              >
                ×
              </button>
            </div>
          </div>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export default function TalentFilterSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const [skillQuery, setSkillQuery] = useState("");
  const [activeJobCategory, setActiveJobCategory] =
    useState<InterestCategoryId>(JOB_CATEGORY_OPTIONS[0].id);

  const getList = (key: string): string[] =>
    (searchParams.get(key) ?? "").split(",").filter(Boolean);

  const selected = {
    school: getList("school"),
    year: getList("year"),
    status: getList("status"),
    jobs: getList("jobs"),
    industries: getList("industries"),
    skills: getList("skills"),
    intern: searchParams.get("intern") === "1",
    offers: searchParams.get("offers") === "1",
  };

  function apply(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    // 필터가 바뀌면 첫 페이지부터
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function toggleListValue(key: string, value: string) {
    apply((params) => {
      const current = (params.get(key) ?? "").split(",").filter(Boolean);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (next.length > 0) params.set(key, next.join(","));
      else params.delete(key);
    });
  }

  function toggleFlag(key: string) {
    apply((params) => {
      if (params.get(key) === "1") params.delete(key);
      else params.set(key, "1");
    });
  }

  function clearKeys(...keys: string[]) {
    apply((params) => {
      keys.forEach((key) => params.delete(key));
    });
  }

  /**
   * 채용 포지션 토글 — "전체"(대분류 id)와 세부 직무 id는 상호 배타:
   * 전체 선택 시 해당 대분류의 세부 선택을 비우고, 세부 선택 시 전체를 해제한다.
   */
  function toggleJobValue(value: string, categoryId: InterestCategoryId) {
    apply((params) => {
      const current = (params.get("jobs") ?? "").split(",").filter(Boolean);
      let next: string[];
      if (current.includes(value)) {
        next = current.filter((v) => v !== value);
      } else if (value === categoryId) {
        const subIds = new Set<string>(
          INTEREST_SUBCATEGORIES[categoryId].map((j) => j.id),
        );
        next = [...current.filter((v) => !subIds.has(v)), value];
      } else {
        next = [...current.filter((v) => v !== categoryId), value];
      }
      if (next.length > 0) params.set("jobs", next.join(","));
      else params.delete("jobs");
    });
  }

  function resetAll() {
    const sort = searchParams.get("sort");
    setOpenSection(null);
    router.replace(sort ? `${pathname}?sort=${sort}` : pathname, {
      scroll: false,
    });
  }

  function sectionProps(id: SectionId) {
    return {
      open: openSection === id,
      onToggle: () => setOpenSection((v) => (v === id ? null : id)),
      onClose: () => setOpenSection(null),
    };
  }

  const activeTotal =
    selected.school.length +
    selected.year.length +
    selected.status.length +
    selected.jobs.length +
    selected.industries.length +
    selected.skills.length +
    (selected.intern ? 1 : 0) +
    (selected.offers ? 1 : 0);

  const filteredSkills = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    if (!q) return SKILL_CATALOG;
    return SKILL_CATALOG.filter((s) => s.toLowerCase().includes(q));
  }, [skillQuery]);

  const jobSummaryChips: SummaryChip[] = selected.jobs.map((id) => {
    const isCategory = isInterestCategoryId(id);
    const label = isCategory
      ? `${interestCategoryLabel(id)} 전체`
      : isInterestJobId(id)
        ? interestJobLabel(id)
        : id;
    const categoryId = isCategory
      ? id
      : isInterestJobId(id)
        ? categoryOfInterestJob(id)
        : activeJobCategory;
    return {
      key: id,
      label,
      onRemove: () => toggleJobValue(id, categoryId),
    };
  });

  const industrySummaryChips: SummaryChip[] = selected.industries.map((id) => ({
    key: id,
    label: INTEREST_INDUSTRIES.find((i) => i.id === id)?.label ?? id,
    onRemove: () => toggleListValue("industries", id),
  }));

  const skillSummaryChips: SummaryChip[] = selected.skills.map((skill) => ({
    key: skill,
    label: skill,
    onRemove: () => toggleListValue("skills", skill),
  }));

  const yearSummaryChips: SummaryChip[] = selected.year.map((value) => ({
    key: value,
    label:
      YEAR_OPTIONS.find((o) => String(o.value) === value)?.label ?? value,
    onRemove: () => toggleListValue("year", value),
  }));

  const statusSummaryChips: SummaryChip[] = selected.status.map((status) => ({
    key: status,
    label: status,
    onRemove: () => toggleListValue("status", status),
  }));

  const schoolSummaryChips: SummaryChip[] = selected.school.map((category) => ({
    key: category,
    label: category,
    onRemove: () => toggleListValue("school", category),
  }));

  const workStatusSummaryChips: SummaryChip[] = [
    ...(selected.offers
      ? [
          {
            key: "offers",
            label: "제안 환영",
            onRemove: () => toggleFlag("offers"),
          },
        ]
      : []),
    ...(selected.intern
      ? [
          {
            key: "intern",
            label: "인턴·경력 경험 보유",
            onRemove: () => toggleFlag("intern"),
          },
        ]
      : []),
  ];

  return (
    <aside className="relative w-full shrink-0 rounded-xl border border-gray-200 bg-white p-4 lg:w-64">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <p className="text-sm font-bold text-ink">조건 필터</p>
        {activeTotal > 0 ? (
          <button
            type="button"
            onClick={resetAll}
            className="text-xs font-medium text-ink/50 hover:text-brand"
          >
            필터 초기화
          </button>
        ) : null}
      </div>

      <div className="pt-1">
        <FlyoutSection
          title="채용 포지션"
          activeCount={selected.jobs.length}
          onReset={() => clearKeys("jobs")}
          summaryChips={jobSummaryChips}
          {...sectionProps("jobs")}
        >
          <div className="flex flex-wrap gap-1.5 border-b border-gray-100 pb-3">
            {JOB_CATEGORY_OPTIONS.map((cat) => {
              const isBrowsing = cat.id === activeJobCategory;
              const hasSelection =
                selected.jobs.includes(cat.id) ||
                INTEREST_SUBCATEGORIES[cat.id].some((j) =>
                  selected.jobs.includes(j.id),
                );
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveJobCategory(cat.id)}
                  className={`${chipBase} ${
                    isBrowsing
                      ? "border-ink/80 bg-beige text-ink"
                      : hasSelection
                        ? chipActive
                        : chipIdle
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() =>
                toggleJobValue(activeJobCategory, activeJobCategory)
              }
              className={`${chipBase} ${
                selected.jobs.includes(activeJobCategory)
                  ? chipActive
                  : chipIdle
              }`}
            >
              전체
            </button>
            {INTEREST_SUBCATEGORIES[activeJobCategory].map((job) => {
              const active =
                selected.jobs.includes(job.id) ||
                selected.jobs.includes(activeJobCategory);
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => toggleJobValue(job.id, activeJobCategory)}
                  className={`${chipBase} ${active ? chipActive : chipIdle}`}
                >
                  {job.label}
                </button>
              );
            })}
          </div>
        </FlyoutSection>

        <FlyoutSection
          title="구직 상태"
          activeCount={(selected.intern ? 1 : 0) + (selected.offers ? 1 : 0)}
          onReset={() => clearKeys("intern", "offers")}
          summaryChips={workStatusSummaryChips}
          {...sectionProps("workStatus")}
        >
          <div className="space-y-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink/80">
              <input
                type="checkbox"
                checked={selected.offers}
                onChange={() => toggleFlag("offers")}
                className="h-4 w-4 rounded border-gray-300 accent-brand"
              />
              제안 환영 인재만
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink/80">
              <input
                type="checkbox"
                checked={selected.intern}
                onChange={() => toggleFlag("intern")}
                className="h-4 w-4 rounded border-gray-300 accent-brand"
              />
              인턴·경력 경험 보유
            </label>
          </div>
        </FlyoutSection>

        <FlyoutSection
          title="스킬"
          activeCount={selected.skills.length}
          onReset={() => clearKeys("skills")}
          summaryChips={skillSummaryChips}
          {...sectionProps("skills")}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-2">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="h-4 w-4 shrink-0 text-ink/40"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-4.35-4.35m1.6-5.15a6.75 6.75 0 11-13.5 0 6.75 6.75 0 0113.5 0z"
                />
              </svg>
              <input
                type="search"
                value={skillQuery}
                onChange={(e) => setSkillQuery(e.target.value)}
                placeholder="찾으시는 스킬을 입력해주세요"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink/40 outline-none"
              />
            </div>
            <div className="flex max-h-72 flex-wrap gap-1.5 overflow-y-auto">
              {filteredSkills.map((skill) => {
                const active = selected.skills.includes(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleListValue("skills", skill)}
                    className={`${chipBase} ${active ? chipActive : chipIdle}`}
                  >
                    {skill}
                  </button>
                );
              })}
              {filteredSkills.length === 0 ? (
                <p className="py-4 text-sm text-ink/40">
                  일치하는 스킬이 없어요.
                </p>
              ) : null}
            </div>
          </div>
        </FlyoutSection>

        <FlyoutSection
          title="관심 산업"
          activeCount={selected.industries.length}
          onReset={() => clearKeys("industries")}
          summaryChips={industrySummaryChips}
          {...sectionProps("industries")}
        >
          <div className="flex flex-wrap gap-1.5">
            {INTEREST_INDUSTRIES.map((ind) => {
              const active = selected.industries.includes(ind.id);
              return (
                <button
                  key={ind.id}
                  type="button"
                  onClick={() => toggleListValue("industries", ind.id)}
                  className={`${chipBase} ${active ? chipActive : chipIdle}`}
                >
                  {ind.label}
                </button>
              );
            })}
          </div>
        </FlyoutSection>

        <FlyoutSection
          title="학년"
          activeCount={selected.year.length}
          onReset={() => clearKeys("year")}
          summaryChips={yearSummaryChips}
          {...sectionProps("year")}
        >
          <div className="flex flex-wrap gap-1.5">
            {YEAR_OPTIONS.map((opt) => {
              const value = String(opt.value);
              const active = selected.year.includes(value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleListValue("year", value)}
                  className={`${chipBase} ${active ? chipActive : chipIdle}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </FlyoutSection>

        <FlyoutSection
          title="재학 상태"
          activeCount={selected.status.length}
          onReset={() => clearKeys("status")}
          summaryChips={statusSummaryChips}
          {...sectionProps("status")}
        >
          <div className="flex flex-wrap gap-1.5">
            {ENROLLMENT_STATUS_OPTIONS.map((status) => {
              const active = selected.status.includes(status);
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleListValue("status", status)}
                  className={`${chipBase} ${active ? chipActive : chipIdle}`}
                >
                  {status}
                </button>
              );
            })}
          </div>
        </FlyoutSection>

        <FlyoutSection
          title="학교 유형"
          activeCount={selected.school.length}
          onReset={() => clearKeys("school")}
          summaryChips={schoolSummaryChips}
          {...sectionProps("school")}
        >
          <div className="flex flex-wrap gap-1.5">
            {SCHOOL_CATEGORY_OPTIONS.map((category) => {
              const active = selected.school.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => toggleListValue("school", category)}
                  className={`${chipBase} ${active ? chipActive : chipIdle}`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </FlyoutSection>
      </div>
    </aside>
  );
}
