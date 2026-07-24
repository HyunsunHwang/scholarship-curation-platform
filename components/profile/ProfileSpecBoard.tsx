"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SpecItemType } from "@/lib/database.types";
import {
  SPEC_SECTIONS,
  isExperienceType,
  experienceKindLabel,
  formatSpecPeriod,
  formatSpecDate,
  type ExperienceKind,
  type SpecItem,
  type SpecSectionDef,
} from "@/lib/profile-spec";
import {
  deleteSpecItem,
  saveSpecItem,
  updateProfileIntro,
} from "@/app/mypage/spec-actions";
import { countFileArtifacts } from "@/lib/profile-artifacts";
import ExperienceForm from "@/components/profile/ExperienceForm";
import InterestJobPicker from "@/components/profile/InterestJobPicker";
import InterestIndustryPicker from "@/components/profile/InterestIndustryPicker";
import SkillPicker from "@/components/profile/SkillPicker";
import DatePicker from "@/components/profile/DatePicker";
import {
  INTEREST_CATEGORY_MAX,
  interestJobLabel,
  type InterestJobId,
} from "@/lib/interestCategories";
import {
  INTEREST_INDUSTRY_MAX,
  interestIndustryLabel,
  type InterestIndustryId,
} from "@/lib/interestIndustries";
import { SKILL_MAX, type SkillName } from "@/lib/skills";
import {
  LANGUAGE_EXAM_OPTIONS,
  LANGUAGE_OPTIONS,
  LANGUAGE_PROFICIENCY_LEVELS,
  encodeLanguageScore,
  parseLanguageScore,
  proficiencyLabel,
  type LanguageProficiencyId,
} from "@/lib/language-spec";

type IntroState = {
  headline: string | null;
  bio: string | null;
  interest_categories: InterestJobId[];
  interest_industries: InterestIndustryId[];
  skills: SkillName[];
};

type IntroSection = "bio" | "jobs" | "industries" | "skills";

type InlineEditor =
  | { kind: "intro"; section: IntroSection }
  | { kind: "experience"; item: SpecItem | null }
  | { kind: "spec"; section: SpecSectionDef; item: SpecItem | null }
  | null;

/** DB 날짜 값 → picker 값 "YYYY-MM-DD" */
function toDateInputValue(dateStr: string | null): string {
  if (!dateStr) return "";
  return dateStr.slice(0, 10);
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
      />
    </svg>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/15";
const labelClass = "block text-xs font-semibold text-ink/60";

function LanguageSpecForm({
  item,
  onClose,
}: {
  item: SpecItem | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const parsedScore = parseLanguageScore(item?.description ?? null);
  const initialLang =
    item?.title &&
    (LANGUAGE_OPTIONS as readonly string[]).includes(item.title)
      ? item.title
      : item?.title
        ? "기타"
        : "영어";
  const initialProficiency =
    LANGUAGE_PROFICIENCY_LEVELS.find((l) => l.label === item?.organization)
      ?.id ?? "daily";

  const [language, setLanguage] = useState(initialLang);
  const [customLanguage, setCustomLanguage] = useState(
    initialLang === "기타" && item?.title && item.title !== "기타"
      ? item.title
      : ""
  );
  const [proficiency, setProficiency] =
    useState<LanguageProficiencyId>(initialProficiency);
  const [hasScore, setHasScore] = useState(Boolean(parsedScore));
  const [exam, setExam] = useState(parsedScore?.exam || "TOEIC");
  const [customExam, setCustomExam] = useState(
    parsedScore?.exam &&
      !(LANGUAGE_EXAM_OPTIONS as readonly string[]).includes(parsedScore.exam)
      ? parsedScore.exam
      : ""
  );
  const [score, setScore] = useState(parsedScore?.score ?? "");
  const [startDate, setStartDate] = useState(
    toDateInputValue(item?.start_date ?? null)
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const title =
      language === "기타" ? customLanguage.trim() || "기타" : language;
    if (!title) {
      setError("언어를 입력해 주세요.");
      return;
    }
    if (hasScore) {
      const examName =
        exam === "기타" ? customExam.trim() || "기타" : exam;
      if (!examName || !score.trim()) {
        setError("시험명과 점수를 입력해 주세요.");
        return;
      }
    }

    startTransition(async () => {
      const description = hasScore
        ? encodeLanguageScore(
            exam === "기타" ? customExam.trim() || "기타" : exam,
            score
          )
        : null;
      const result = await saveSpecItem({
        id: item?.id,
        item_type: "language",
        title,
        organization: proficiencyLabel(proficiency),
        description: description ?? "",
        start_date: hasScore ? startDate : "",
        end_date: "",
        is_current: false,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 space-y-4 rounded-xl border border-gray-200 bg-beige/40 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">
          {item ? "어학 수정" : "어학 추가"}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-semibold text-ink/45 hover:text-ink"
          aria-label="닫기"
        >
          ×
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div className="min-w-[8rem]">
          <label className={labelClass} htmlFor="lang-name">
            언어
          </label>
          <select
            id="lang-name"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className={`${inputClass} mt-1`}
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {language === "기타" ? (
            <input
              value={customLanguage}
              onChange={(e) => setCustomLanguage(e.target.value)}
              maxLength={40}
              placeholder="언어 이름"
              className={`${inputClass} mt-1.5`}
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <span className={labelClass}>구사 수준</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {LANGUAGE_PROFICIENCY_LEVELS.map((level) => {
              const selected = proficiency === level.id;
              return (
                <button
                  key={level.id}
                  type="button"
                  onClick={() => setProficiency(level.id)}
                  aria-pressed={selected}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    selected
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-gray-200 bg-white text-ink/60 hover:border-brand/40"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                      selected ? "border-brand" : "border-gray-300"
                    }`}
                    aria-hidden
                  >
                    {selected ? (
                      <span className="h-2 w-2 rounded-full bg-brand" />
                    ) : null}
                  </span>
                  {level.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink/70">
        <input
          type="checkbox"
          checked={hasScore}
          onChange={(e) => setHasScore(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 accent-brand"
        />
        어학 성적이 있어요
      </label>

      {hasScore ? (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="lang-exam">
                시험
              </label>
              <select
                id="lang-exam"
                value={
                  (LANGUAGE_EXAM_OPTIONS as readonly string[]).includes(exam)
                    ? exam
                    : "기타"
                }
                onChange={(e) => setExam(e.target.value)}
                className={`${inputClass} mt-1`}
              >
                {LANGUAGE_EXAM_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              {exam === "기타" ||
              !(LANGUAGE_EXAM_OPTIONS as readonly string[]).includes(exam) ? (
                <input
                  value={customExam || (!(LANGUAGE_EXAM_OPTIONS as readonly string[]).includes(exam) ? exam : "")}
                  onChange={(e) => {
                    setExam("기타");
                    setCustomExam(e.target.value);
                  }}
                  maxLength={40}
                  placeholder="시험 이름"
                  className={`${inputClass} mt-1.5`}
                />
              ) : null}
            </div>
            <div>
              <label className={labelClass} htmlFor="lang-score">
                점수·등급
              </label>
              <input
                id="lang-score"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                maxLength={40}
                placeholder="예: 900 / IH / 6.5"
                className={`${inputClass} mt-1`}
              />
            </div>
          </div>
          <div>
            <span className={labelClass}>취득일</span>
            <div className="mt-1 max-w-xs">
              <DatePicker
                ariaLabel="취득일"
                value={startDate}
                onChange={setStartDate}
                placeholder="선택"
              />
            </div>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-beige"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand/85 disabled:opacity-60"
        >
          {isPending ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}

function SpecItemForm({
  section,
  item,
  onClose,
}: {
  section: SpecSectionDef;
  item: SpecItem | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(item?.title ?? "");
  const [organization, setOrganization] = useState(item?.organization ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [startDate, setStartDate] = useState(toDateInputValue(item?.start_date ?? null));
  const [endDate, setEndDate] = useState(toDateInputValue(item?.end_date ?? null));
  const [isCurrent, setIsCurrent] = useState(item?.is_current ?? false);

  if (section.type === "language") {
    return <LanguageSpecForm item={item} onClose={onClose} />;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveSpecItem({
        id: item?.id,
        item_type: section.type,
        title,
        organization,
        description,
        start_date: startDate,
        end_date: endDate,
        is_current: section.hasPeriod ? isCurrent : false,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 space-y-4 rounded-xl border border-gray-200 bg-beige/40 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">
          {item ? `${section.label} 수정` : section.addLabel}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-semibold text-ink/45 hover:text-ink"
          aria-label="닫기"
        >
          ×
        </button>
      </div>
      <div>
        <label className={labelClass} htmlFor="spec-title">
          제목 *
        </label>
        <input
          id="spec-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={120}
          placeholder={
            section.type === "certification"
              ? "예: 정보처리기사"
              : "예: 마케팅 인턴"
          }
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="spec-org">
          {section.orgLabel}
        </label>
        <input
          id="spec-org"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          maxLength={120}
          className={inputClass}
        />
      </div>

      {section.hasPeriod ? (
        <div>
          <span className={labelClass}>기간</span>
          <div className="mt-1 space-y-2">
            <DatePicker
              ariaLabel="시작 날짜"
              value={startDate}
              onChange={setStartDate}
              placeholder="시작 날짜"
            />
            <DatePicker
              ariaLabel="종료 날짜"
              value={endDate}
              onChange={setEndDate}
              disabled={isCurrent}
              placeholder="종료 날짜"
            />
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-ink/70">
            <input
              type="checkbox"
              checked={isCurrent}
              onChange={(e) => setIsCurrent(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 accent-brand"
            />
            현재 진행 중
          </label>
        </div>
      ) : (
        <div>
          <span className={labelClass}>
            {section.type === "award" ? "수상일" : "취득일"}
          </span>
          <DatePicker
            ariaLabel={section.type === "award" ? "수상일" : "취득일"}
            value={startDate}
            onChange={setStartDate}
            placeholder="선택"
          />
        </div>
      )}

      <div>
        <label className={labelClass} htmlFor="spec-desc">
          설명
        </label>
        <textarea
          id="spec-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="담당 업무, 성과 등을 적어 주세요."
          className={`${inputClass} resize-y`}
        />
      </div>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-beige"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand/85 disabled:opacity-60"
        >
          {isPending ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}

function IntroFormActions({
  error,
  isPending,
  onClose,
}: {
  error: string | null;
  isPending: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-beige"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand/85 disabled:opacity-60"
        >
          {isPending ? "저장 중…" : "저장"}
        </button>
      </div>
    </>
  );
}

function useIntroSave(intro: IntroState, onClose: () => void) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(
    patch: Partial<{
      headline: string;
      bio: string;
      interest_categories: InterestJobId[];
      interest_industries: InterestIndustryId[];
      skills: SkillName[];
    }>
  ) {
    setError(null);
    startTransition(async () => {
      const result = await updateProfileIntro({
        headline: patch.headline ?? intro.headline ?? "",
        bio: patch.bio ?? intro.bio ?? "",
        interest_categories: patch.interest_categories ?? intro.interest_categories,
        interest_industries: patch.interest_industries ?? intro.interest_industries,
        skills: patch.skills ?? intro.skills,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return { isPending, error, save };
}

function IntroBioForm({
  intro,
  onClose,
}: {
  intro: IntroState;
  onClose: () => void;
}) {
  const { isPending, error, save } = useIntroSave(intro, onClose);
  const [headline, setHeadline] = useState(intro.headline ?? "");
  const [bio, setBio] = useState(intro.bio ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save({ headline, bio });
      }}
      className="mt-3 space-y-4"
    >
      <div>
        <label className={labelClass} htmlFor="intro-headline">
          한 줄 소개
        </label>
        <input
          id="intro-headline"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={100}
          placeholder="예: 데이터로 문제를 푸는 경영학도"
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="intro-bio">
          소개
        </label>
        <textarea
          id="intro-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={1000}
          rows={5}
          placeholder="목표, 강점, 관심 직무 이야기를 자유롭게 소개해 주세요."
          className={`${inputClass} resize-y`}
        />
      </div>
      <IntroFormActions error={error} isPending={isPending} onClose={onClose} />
    </form>
  );
}

function IntroJobsForm({
  intro,
  onClose,
}: {
  intro: IntroState;
  onClose: () => void;
}) {
  const { isPending, error, save } = useIntroSave(intro, onClose);
  const [interests, setInterests] = useState<InterestJobId[]>(
    intro.interest_categories
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save({ interest_categories: interests });
      }}
      className="mt-3 space-y-4"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={labelClass}>관심 직무</span>
        <span className="text-[11px] font-medium text-ink/40">
          최대 {INTEREST_CATEGORY_MAX}개
        </span>
      </div>
      <InterestJobPicker
        value={interests}
        onChange={setInterests}
        max={INTEREST_CATEGORY_MAX}
      />
      <IntroFormActions error={error} isPending={isPending} onClose={onClose} />
    </form>
  );
}

function IntroIndustriesForm({
  intro,
  onClose,
}: {
  intro: IntroState;
  onClose: () => void;
}) {
  const { isPending, error, save } = useIntroSave(intro, onClose);
  const [industries, setIndustries] = useState<InterestIndustryId[]>(
    intro.interest_industries
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save({ interest_industries: industries });
      }}
      className="mt-3 space-y-4"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={labelClass}>관심 산업</span>
        <span className="text-[11px] font-medium text-ink/40">
          선택 · 최대 {INTEREST_INDUSTRY_MAX}개
        </span>
      </div>
      <InterestIndustryPicker
        value={industries}
        onChange={setIndustries}
        max={INTEREST_INDUSTRY_MAX}
      />
      <IntroFormActions error={error} isPending={isPending} onClose={onClose} />
    </form>
  );
}

function IntroSkillsForm({
  intro,
  onClose,
}: {
  intro: IntroState;
  onClose: () => void;
}) {
  const { isPending, error, save } = useIntroSave(intro, onClose);
  const [skills, setSkills] = useState<SkillName[]>(intro.skills);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save({ skills });
      }}
      className="mt-3 space-y-4"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={labelClass}>보유 스킬</span>
        <span className="text-[11px] font-medium text-ink/40">
          선택 · 최대 {SKILL_MAX}개
        </span>
      </div>
      <SkillPicker value={skills} onChange={setSkills} max={SKILL_MAX} />
      <IntroFormActions error={error} isPending={isPending} onClose={onClose} />
    </form>
  );
}

function IntroSectionEditButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-ink/45 hover:bg-beige hover:text-ink"
      aria-label={label}
    >
      <PencilIcon className="h-4 w-4" />
    </button>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}

/** YYYY-MM-DD 문자열 비교용. null/빈 값은 가장 작음(정렬 시 nulls last와 함께 사용). */
function compareDateDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);
}

/** 통합 "경험" 섹션의 항목 행: 타임라인 노드 + 종류 배지 + STAR */
function ExperienceItemRow({
  item,
  isLast,
  onEdit,
}: {
  item: SpecItem;
  isLast: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const period = formatSpecPeriod(item);

  function remove() {
    if (!window.confirm("이 항목을 삭제할까요?")) return;
    startTransition(async () => {
      const result = await deleteSpecItem(item.id);
      if ("error" in result) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  const starLines: { label: string; value: string; strong?: boolean }[] = [
    { label: "역할", value: item.star_role ?? "" },
    { label: "행동", value: item.star_action ?? "" },
    { label: "결과", value: item.star_result ?? "", strong: true },
  ].filter((l) => l.value);

  return (
    <li className={`group relative flex gap-3 ${isPending ? "opacity-50" : ""}`}>
      {/* 세로 레일 + 노드 */}
      <div className="relative flex w-4 shrink-0 flex-col items-center">
        <span
          className="relative z-1 mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-brand bg-white"
          aria-hidden
        />
        {!isLast ? (
          <span
            className="absolute top-4 bottom-0 w-px bg-gray-200"
            aria-hidden
          />
        ) : null}
      </div>

      <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-5"}`}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-beige px-2 py-0.5 text-[11px] font-bold text-ink/60">
                {experienceKindLabel(item.item_type)}
              </span>
              <p className="text-sm font-bold text-ink">{item.title}</p>
            </div>
            {(item.organization || period) ? (
              <p className="mt-0.5 text-xs text-ink/50">
                {[item.organization, period].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            {starLines.length > 0 ? (
              <dl className="mt-1.5 space-y-0.5">
                {starLines.map((line) => (
                  <div key={line.label} className="flex gap-2 text-sm leading-relaxed">
                    <dt className="shrink-0 text-xs font-semibold leading-6 text-ink/45">
                      {line.label}
                    </dt>
                    <dd
                      className={`whitespace-pre-wrap ${
                        line.strong ? "font-semibold text-ink" : "text-ink/75"
                      }`}
                    >
                      {line.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : item.description ? (
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink/75">
                {item.description}
              </p>
            ) : null}
            {item.skills.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.skills.map((name) => (
                  <span
                    key={name}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-ink/65"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : null}
            {item.artifacts?.length ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {item.artifacts.map((a) => (
                  <li key={a.id}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-[220px] items-center gap-1.5 truncate rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-brand hover:border-brand/40"
                      title={a.kind === "link" ? a.url : a.name}
                    >
                      <span className="shrink-0 text-ink/40">
                        {a.kind === "link" ? "링크" : "파일"}
                      </span>
                      <span className="truncate">
                        {a.kind === "link" ? a.title || a.url : a.name}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={onEdit}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink/45 hover:bg-beige hover:text-ink"
              aria-label="수정"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={isPending}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink/45 hover:bg-red-50 hover:text-red-600"
              aria-label="삭제"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function SpecItemRow({
  item,
  section,
  onEdit,
}: {
  item: SpecItem;
  section: SpecSectionDef;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isLanguage = section.type === "language";
  const period = section.hasPeriod
    ? formatSpecPeriod(item)
    : formatSpecDate(item.start_date);
  const langScore = isLanguage ? parseLanguageScore(item.description) : null;

  function remove() {
    if (!window.confirm("이 항목을 삭제할까요?")) return;
    startTransition(async () => {
      const result = await deleteSpecItem(item.id);
      if ("error" in result) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className={`group flex gap-3 py-3 ${isPending ? "opacity-50" : ""}`}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-beige text-sm font-bold text-ink/50">
        {item.title.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        {isLanguage ? (
          <>
            <p className="text-sm font-bold text-ink">{item.title}</p>
            <p className="text-sm text-ink/60">
              {[
                item.organization,
                langScore
                  ? [langScore.exam, langScore.score].filter(Boolean).join(" ")
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {period ? (
              <p className="mt-0.5 text-xs text-ink/45">{period}</p>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-ink">{item.title}</p>
            {item.organization ? (
              <p className="text-sm text-ink/60">{item.organization}</p>
            ) : null}
            {period ? <p className="mt-0.5 text-xs text-ink/45">{period}</p> : null}
            {item.description ? (
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink/75">
                {item.description}
              </p>
            ) : null}
          </>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink/45 hover:bg-beige hover:text-ink"
          aria-label="수정"
        >
          <PencilIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink/45 hover:bg-red-50 hover:text-red-600"
          aria-label="삭제"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

export default function ProfileSpecBoard({
  intro,
  items,
}: {
  intro: IntroState;
  items: SpecItem[];
}) {
  const [editor, setEditor] = useState<InlineEditor>(null);

  function openEditor(next: InlineEditor) {
    setEditor(next);
  }

  function closeEditor() {
    setEditor(null);
  }

  const itemsByType = useMemo(() => {
    const map = new Map<SpecItemType, SpecItem[]>();
    for (const item of items) {
      const list = map.get(item.item_type) ?? [];
      list.push(item);
      map.set(item.item_type, list);
    }
    return map;
  }, [items]);

  /** 경험 통합 목록: 최신 시작일 위 (nulls last). sort_order는 무시 */
  const experienceItems = useMemo(
    () =>
      items
        .filter((item) => isExperienceType(item.item_type))
        .slice()
        .sort((a, b) => {
          const byStart = compareDateDesc(a.start_date, b.start_date);
          if (byStart !== 0) return byStart;
          const byEnd = compareDateDesc(a.end_date, b.end_date);
          if (byEnd !== 0) return byEnd;
          return b.id.localeCompare(a.id);
        }),
    [items]
  );
  const otherSections = SPEC_SECTIONS.filter((s) => !isExperienceType(s.type));

  /** 편집 전체 파일 수 (현재 편집 중인 항목 제외는 모달에서 계산) */
  const totalProfileFiles = useMemo(
    () => items.reduce((sum, it) => sum + countFileArtifacts(it.artifacts), 0),
    [items]
  );

  const interests = intro.interest_categories;
  const industries = intro.interest_industries;
  const skills = intro.skills;
  const introSection = editor?.kind === "intro" ? editor.section : null;
  const experienceEditor =
    editor?.kind === "experience" ? editor : null;
  const editingExperienceId = experienceEditor?.item?.id ?? null;

  return (
    <div className="space-y-4">
      {/* 소개 */}
      <section
        id="profile-intro"
        className="scroll-mt-24 rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-ink">소개</h2>
          {introSection !== "bio" ? (
            <IntroSectionEditButton
              label="소개 수정"
              onClick={() => openEditor({ kind: "intro", section: "bio" })}
            />
          ) : null}
        </div>

        {introSection === "bio" ? (
          <IntroBioForm intro={intro} onClose={closeEditor} />
        ) : intro.bio ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
            {intro.bio}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => openEditor({ kind: "intro", section: "bio" })}
            className="mt-2 text-sm text-ink/45 hover:text-brand"
          >
            아직 소개가 없어요. 나를 한 문단으로 소개해 보세요.
          </button>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">관심 직무</h3>
          {introSection !== "jobs" ? (
            <IntroSectionEditButton
              label="관심 직무 수정"
              onClick={() => openEditor({ kind: "intro", section: "jobs" })}
            />
          ) : null}
        </div>
        {introSection === "jobs" ? (
          <IntroJobsForm intro={intro} onClose={closeEditor} />
        ) : interests.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {interests.map((id) => (
              <span
                key={id}
                className="rounded-xl border border-gray-200 bg-beige px-3 py-1 text-xs font-semibold text-ink/75"
              >
                {interestJobLabel(id)}
              </span>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => openEditor({ kind: "intro", section: "jobs" })}
            className="mt-2 text-sm text-ink/45 hover:text-brand"
          >
            관심 직무를 골라 주세요.
          </button>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">관심 산업</h3>
          {introSection !== "industries" ? (
            <IntroSectionEditButton
              label="관심 산업 수정"
              onClick={() => openEditor({ kind: "intro", section: "industries" })}
            />
          ) : null}
        </div>
        {introSection === "industries" ? (
          <IntroIndustriesForm intro={intro} onClose={closeEditor} />
        ) : industries.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {industries.map((id) => (
              <span
                key={id}
                className="rounded-xl border border-gray-200 bg-beige px-3 py-1 text-xs font-semibold text-ink/75"
              >
                {interestIndustryLabel(id)}
              </span>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => openEditor({ kind: "intro", section: "industries" })}
            className="mt-2 text-sm text-ink/45 hover:text-brand"
          >
            관심 산업을 골라 주세요. (선택)
          </button>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">보유 스킬</h3>
          {introSection !== "skills" ? (
            <IntroSectionEditButton
              label="보유 스킬 수정"
              onClick={() => openEditor({ kind: "intro", section: "skills" })}
            />
          ) : null}
        </div>
        {introSection === "skills" ? (
          <IntroSkillsForm intro={intro} onClose={closeEditor} />
        ) : skills.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {skills.map((name) => (
              <span
                key={name}
                className="rounded-xl border border-gray-200 bg-beige px-3 py-1 text-xs font-semibold text-ink/75"
              >
                {name}
              </span>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => openEditor({ kind: "intro", section: "skills" })}
            className="mt-2 text-sm text-ink/45 hover:text-brand"
          >
            보유 스킬을 골라 주세요. (선택)
          </button>
        )}
      </section>

      {/* 통합 경험 섹션 */}
      <section
        id="profile-experience"
        className="scroll-mt-24 rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-ink">
              경험
              {experienceItems.length > 0 ? (
                <span className="ml-1.5 text-sm font-semibold text-ink/40">
                  {experienceItems.length}
                </span>
              ) : null}
            </h2>
            <p className="mt-0.5 text-xs text-ink/45">
              경력 · 대외활동 · 교육 · 프로젝트 · 수상 — 종류는 분류·추천에만
              쓰여요.
            </p>
          </div>
          {!experienceEditor || experienceEditor.item ? (
            <button
              type="button"
              onClick={() => openEditor({ kind: "experience", item: null })}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink/45 hover:bg-beige hover:text-ink"
              aria-label="경험 추가"
              title="경험 추가"
            >
              <PlusIcon className="h-4.5 w-4.5" />
            </button>
          ) : null}
        </div>

        {experienceEditor && !experienceEditor.item ? (
          <div className="mt-3 rounded-xl border border-gray-200 bg-beige/40 p-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink">경험 추가</h3>
              <button
                type="button"
                onClick={closeEditor}
                className="text-sm font-semibold text-ink/45 hover:text-ink"
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <ExperienceForm
              item={null}
              initialKind="experience"
              profileFileCount={totalProfileFiles}
              onClose={closeEditor}
            />
          </div>
        ) : null}

        {experienceItems.length === 0 && !experienceEditor ? (
          <button
            type="button"
            onClick={() => openEditor({ kind: "experience", item: null })}
            className="mt-3 text-sm text-ink/45 hover:text-brand"
          >
            인턴, 동아리, 교육, 프로젝트, 수상까지 — 경험을 한 곳에 기록해 보세요.
          </button>
        ) : (
          <ul className="mt-4">
            {experienceItems.map((item, index) => {
              if (editingExperienceId === item.id) {
                return (
                  <li key={item.id} className="mb-4">
                    <div className="rounded-xl border border-gray-200 bg-beige/40 p-4">
                      <div className="mb-1 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-ink">경험 수정</h3>
                        <button
                          type="button"
                          onClick={closeEditor}
                          className="text-sm font-semibold text-ink/45 hover:text-ink"
                          aria-label="닫기"
                        >
                          ×
                        </button>
                      </div>
                      <ExperienceForm
                        item={item}
                        initialKind={
                          isExperienceType(item.item_type)
                            ? (item.item_type as ExperienceKind)
                            : "experience"
                        }
                        profileFileCount={
                          totalProfileFiles - countFileArtifacts(item.artifacts)
                        }
                        onClose={closeEditor}
                      />
                    </div>
                  </li>
                );
              }
              const visibleItems = experienceItems.filter(
                (it) => it.id !== editingExperienceId
              );
              const visibleIndex = visibleItems.findIndex((it) => it.id === item.id);
              return (
                <ExperienceItemRow
                  key={item.id}
                  item={item}
                  isLast={visibleIndex === visibleItems.length - 1}
                  onEdit={() => openEditor({ kind: "experience", item })}
                />
              );
            })}
          </ul>
        )}
      </section>

      {/* 나머지 스펙 섹션 (자격증·어학) */}
      {otherSections.map((section) => {
        const sectionItems = itemsByType.get(section.type) ?? [];
        const specEditor =
          editor?.kind === "spec" && editor.section.type === section.type
            ? editor
            : null;
        const editingId = specEditor?.item?.id ?? null;

        return (
          <section
            key={section.type}
            id={`profile-${section.type}`}
            className="scroll-mt-24 rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-ink">
                {section.label}
                {sectionItems.length > 0 ? (
                  <span className="ml-1.5 text-sm font-semibold text-ink/40">
                    {sectionItems.length}
                  </span>
                ) : null}
              </h2>
              {!specEditor || specEditor.item ? (
                <button
                  type="button"
                  onClick={() =>
                    openEditor({ kind: "spec", section, item: null })
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-full text-ink/45 hover:bg-beige hover:text-ink"
                  aria-label={section.addLabel}
                  title={section.addLabel}
                >
                  <PlusIcon className="h-4.5 w-4.5" />
                </button>
              ) : null}
            </div>

            {specEditor && !specEditor.item ? (
              <SpecItemForm
                section={section}
                item={null}
                onClose={closeEditor}
              />
            ) : null}

            {sectionItems.length === 0 && !specEditor ? (
              <button
                type="button"
                onClick={() =>
                  openEditor({ kind: "spec", section, item: null })
                }
                className="mt-2 text-sm text-ink/45 hover:text-brand"
              >
                {section.emptyHint}
              </button>
            ) : (
              <ul className="mt-1 divide-y divide-gray-100">
                {sectionItems.map((item) =>
                  editingId === item.id ? (
                    <li key={item.id} className="py-2">
                      <SpecItemForm
                        section={section}
                        item={item}
                        onClose={closeEditor}
                      />
                    </li>
                  ) : (
                    <SpecItemRow
                      key={item.id}
                      item={item}
                      section={section}
                      onEdit={() =>
                        openEditor({ kind: "spec", section, item })
                      }
                    />
                  )
                )}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
