"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
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
import DatePicker from "@/components/profile/DatePicker";
import {
  INTEREST_CATEGORIES,
  INTEREST_CATEGORY_MAX,
  interestCategoryLabel,
  type InterestCategoryId,
} from "@/lib/interestCategories";

type IntroState = {
  headline: string | null;
  bio: string | null;
  interest_categories: InterestCategoryId[];
};

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

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-200 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        {children}
      </div>
    </div>,
    document.body
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/15";
const labelClass = "block text-xs font-semibold text-ink/60";

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
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div>
        <label className={labelClass} htmlFor="spec-title">
          {section.label === "어학" ? "시험명·점수 *" : "제목 *"}
        </label>
        <input
          id="spec-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={120}
          placeholder={
            section.type === "language"
              ? "예: TOEIC 900"
              : section.type === "certification"
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

function IntroForm({
  intro,
  onClose,
}: {
  intro: IntroState;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [headline, setHeadline] = useState(intro.headline ?? "");
  const [bio, setBio] = useState(intro.bio ?? "");
  const [interests, setInterests] = useState<InterestCategoryId[]>(
    intro.interest_categories
  );

  function toggleInterest(id: InterestCategoryId) {
    setInterests((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= INTEREST_CATEGORY_MAX) return prev;
      return [...prev, id];
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateProfileIntro({
        headline,
        bio,
        interest_categories: interests,
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
    <form onSubmit={submit} className="mt-4 space-y-4">
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
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className={labelClass}>관심 직무</span>
          <span className="text-[11px] font-medium text-ink/40">
            {interests.length} / {INTEREST_CATEGORY_MAX}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {INTEREST_CATEGORIES.map(({ id, label }) => {
            const selected = interests.includes(id);
            const atLimit = !selected && interests.length >= INTEREST_CATEGORY_MAX;
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleInterest(id)}
                disabled={atLimit}
                aria-pressed={selected}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  selected
                    ? "border-brand bg-brand text-white"
                    : atLimit
                      ? "cursor-not-allowed border-gray-100 bg-gray-50 text-ink/30"
                      : "border-gray-200 bg-white text-ink/70 hover:border-brand/50 hover:text-brand"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
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

/** 통합 "경험" 섹션의 항목 행: 종류 배지 + STAR(역할/행동/결과) 표시 */
function ExperienceItemRow({
  item,
  onEdit,
}: {
  item: SpecItem;
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
    <li className={`group flex gap-3 py-3.5 ${isPending ? "opacity-50" : ""}`}>
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
  const period = section.hasPeriod
    ? formatSpecPeriod(item)
    : formatSpecDate(item.start_date);

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
        {(item.organization || item.title).charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
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
  const [editingIntro, setEditingIntro] = useState(false);
  const [modalState, setModalState] = useState<{
    section: SpecSectionDef;
    item: SpecItem | null;
  } | null>(null);
  /** 통합 경험(경력·대외활동·프로젝트·수상) 추가/수정 모달 */
  const [experienceModal, setExperienceModal] = useState<{
    item: SpecItem | null;
  } | null>(null);

  const itemsByType = useMemo(() => {
    const map = new Map<SpecItemType, SpecItem[]>();
    for (const item of items) {
      const list = map.get(item.item_type) ?? [];
      list.push(item);
      map.set(item.item_type, list);
    }
    return map;
  }, [items]);

  /** 경험 4종을 하나로 합친 목록 (서버 정렬 순서 유지: sort_order → 최신순) */
  const experienceItems = useMemo(
    () => items.filter((item) => isExperienceType(item.item_type)),
    [items]
  );
  const otherSections = SPEC_SECTIONS.filter((s) => !isExperienceType(s.type));

  /** 편집 전체 파일 수 (현재 편집 중인 항목 제외는 모달에서 계산) */
  const totalProfileFiles = useMemo(
    () => items.reduce((sum, it) => sum + countFileArtifacts(it.artifacts), 0),
    [items]
  );

  const interests = intro.interest_categories;

  return (
    <div className="space-y-4">
      {/* 소개 */}
      <section className="rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-ink">소개</h2>
          <button
            type="button"
            onClick={() => setEditingIntro(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink/45 hover:bg-beige hover:text-ink"
            aria-label="소개 수정"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        </div>
        {intro.bio ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
            {intro.bio}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setEditingIntro(true)}
            className="mt-2 text-sm text-ink/45 hover:text-brand"
          >
            아직 소개가 없어요. 나를 한 문단으로 소개해 보세요.
          </button>
        )}

        <h3 className="mt-5 text-sm font-bold text-ink">관심 직무</h3>
        {interests.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {interests.map((id) => (
              <span
                key={id}
                className="rounded-full bg-beige px-3 py-1 text-xs font-semibold text-ink/75"
              >
                {interestCategoryLabel(id)}
              </span>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingIntro(true)}
            className="mt-2 text-sm text-ink/45 hover:text-brand"
          >
            관심 직무를 골라 주세요.
          </button>
        )}
      </section>

      {/* 통합 경험 섹션: 경력·대외활동·프로젝트·수상 */}
      <section className="rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6">
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
              경력 · 대외활동 · 프로젝트 · 수상 — 종류는 분류·추천에만 쓰여요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExperienceModal({ item: null })}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink/45 hover:bg-beige hover:text-ink"
            aria-label="경험 추가"
            title="경험 추가"
          >
            <PlusIcon className="h-4.5 w-4.5" />
          </button>
        </div>

        {experienceItems.length === 0 ? (
          <button
            type="button"
            onClick={() => setExperienceModal({ item: null })}
            className="mt-3 text-sm text-ink/45 hover:text-brand"
          >
            인턴, 동아리, 프로젝트, 수상까지 — 경험을 한 곳에 기록해 보세요.
          </button>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {experienceItems.map((item) => (
              <ExperienceItemRow
                key={item.id}
                item={item}
                onEdit={() => setExperienceModal({ item })}
              />
            ))}
          </ul>
        )}
      </section>

      {/* 나머지 스펙 섹션 (자격증·어학) */}
      {otherSections.map((section) => {
        const sectionItems = itemsByType.get(section.type) ?? [];
        return (
          <section
            key={section.type}
            className="rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6"
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
              <button
                type="button"
                onClick={() => setModalState({ section, item: null })}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink/45 hover:bg-beige hover:text-ink"
                aria-label={section.addLabel}
                title={section.addLabel}
              >
                <PlusIcon className="h-4.5 w-4.5" />
              </button>
            </div>

            {sectionItems.length === 0 ? (
              <button
                type="button"
                onClick={() => setModalState({ section, item: null })}
                className="mt-2 text-sm text-ink/45 hover:text-brand"
              >
                {section.emptyHint}
              </button>
            ) : (
              <ul className="mt-1 divide-y divide-gray-100">
                {sectionItems.map((item) => (
                  <SpecItemRow
                    key={item.id}
                    item={item}
                    section={section}
                    onEdit={() => setModalState({ section, item })}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {editingIntro ? (
        <Modal title="소개 수정" onClose={() => setEditingIntro(false)}>
          <IntroForm intro={intro} onClose={() => setEditingIntro(false)} />
        </Modal>
      ) : null}

      {modalState ? (
        <Modal
          title={modalState.item ? `${modalState.section.label} 수정` : modalState.section.addLabel}
          onClose={() => setModalState(null)}
        >
          <SpecItemForm
            section={modalState.section}
            item={modalState.item}
            onClose={() => setModalState(null)}
          />
        </Modal>
      ) : null}

      {experienceModal ? (
        <Modal
          title={experienceModal.item ? "경험 수정" : "경험 추가"}
          onClose={() => setExperienceModal(null)}
        >
          <ExperienceForm
            item={experienceModal.item}
            initialKind={
              experienceModal.item && isExperienceType(experienceModal.item.item_type)
                ? (experienceModal.item.item_type as ExperienceKind)
                : "experience"
            }
            profileFileCount={
              totalProfileFiles -
              countFileArtifacts(experienceModal.item?.artifacts)
            }
            onClose={() => setExperienceModal(null)}
          />
        </Modal>
      ) : null}
    </div>
  );
}
