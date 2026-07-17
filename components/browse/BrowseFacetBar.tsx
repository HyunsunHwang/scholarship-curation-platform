"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  browseHref,
  type BrowseKind,
  type BrowseSection,
  type BrowseSort,
} from "@/lib/browse-data";
import {
  EMPTY_BROWSE_FACETS,
  countBrowseFacetSelections,
  facetOptionsFor,
  facetTabsFor,
  hasBrowseFacets,
  listBrowseFacetChips,
  removeBrowseFacetChip,
  searchPlaceholder,
  type BrowseFacetChip,
  type BrowseFacetFilters,
  type BrowseFacetTab,
} from "@/lib/browse-facets";
import type { BenefitCategoryId } from "@/lib/benefit-categories";
import type { InterestCategoryId } from "@/lib/interestCategories";

type BrowseFacetBarProps = {
  kind: BrowseKind;
  sort: BrowseSort;
  section: BrowseSection;
  facets: BrowseFacetFilters;
};

function toggleInList<T extends string>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function cloneFacets(f: BrowseFacetFilters): BrowseFacetFilters {
  return {
    interests: [...f.interests],
    benefits: [...f.benefits],
    orgs: [...f.orgs],
    q: f.q,
  };
}

function FilterSection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: { id: string; label: string }[];
  selected: readonly string[];
  onToggle: (id: string) => void;
}) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const on = selected.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(opt.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "bg-brand text-white"
                  : "bg-beige text-ink/70 hover:bg-cream hover:text-ink"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BrowseFilterSheet({
  open,
  onClose,
  kind,
  section,
  draft,
  setDraft,
  onApply,
  onReset,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  kind: BrowseKind;
  section: BrowseSection;
  draft: BrowseFacetFilters;
  setDraft: (next: BrowseFacetFilters) => void;
  onApply: () => void;
  onReset: () => void;
  isPending: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const tabs = facetTabsFor(kind, section);
  const draftCount = countBrowseFacetSelections(draft);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  function toggleDraft(tab: BrowseFacetTab, id: string) {
    const next = cloneFacets(draft);
    if (tab === "interest") {
      next.interests = toggleInList(draft.interests, id as InterestCategoryId);
    } else if (tab === "benefit") {
      next.benefits = toggleInList(draft.benefits, id as BenefitCategoryId);
    } else {
      next.orgs = toggleInList(draft.orgs, id);
    }
    setDraft(next);
  }

  function selectedFor(tab: BrowseFacetTab): readonly string[] {
    if (tab === "interest") return draft.interests;
    if (tab === "benefit") return draft.benefits;
    return draft.orgs;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-lg font-extrabold text-ink">
            필터
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink/45 transition-colors hover:bg-beige hover:text-ink"
            aria-label="닫기"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5">
          {tabs.map((tab) => (
            <FilterSection
              key={tab.key}
              title={tab.label}
              options={facetOptionsFor(tab.key, kind)}
              selected={selectedFor(tab.key)}
              onToggle={(id) => toggleDraft(tab.key, id)}
            />
          ))}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={isPending}
            onClick={onReset}
            className="rounded-full border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink/70 transition-colors hover:bg-beige"
          >
            초기화
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onApply}
            className="flex-1 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/85 disabled:opacity-60"
          >
            {draftCount > 0
              ? `조건 ${draftCount}개 적용`
              : "결과 보기"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function BrowseFacetBar({
  kind,
  sort,
  section,
  facets,
}: BrowseFacetBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BrowseFacetFilters>(() =>
    cloneFacets(facets)
  );
  const [draftQ, setDraftQ] = useState(facets.q);

  useEffect(() => {
    setDraftQ(facets.q);
  }, [facets.q]);

  useEffect(() => {
    if (!open) setDraft(cloneFacets(facets));
  }, [facets, open]);

  const selectionCount = countBrowseFacetSelections(facets);
  const chips = listBrowseFacetChips(facets, kind);
  const showChips = chips.length > 0;

  function pushFacets(next: BrowseFacetFilters) {
    startTransition(() => {
      router.push(
        browseHref({
          kind,
          section,
          sort,
          page: 1,
          list: true,
          facets: next,
        })
      );
    });
  }

  function openSheet() {
    setDraft(cloneFacets(facets));
    setOpen(true);
  }

  function applySheet() {
    // 시트는 분류 조건만 — 검색어는 바깥 검색창 유지
    pushFacets({ ...draft, q: facets.q });
    setOpen(false);
  }

  function resetSheet() {
    setDraft({ ...EMPTY_BROWSE_FACETS, q: facets.q });
  }

  function onSubmitSearch(e: FormEvent) {
    e.preventDefault();
    pushFacets({ ...facets, q: draftQ.trim() });
  }

  function onRemoveChip(chip: BrowseFacetChip) {
    const next = removeBrowseFacetChip(facets, chip);
    if (chip.dimension === "q") setDraftQ("");
    pushFacets(next);
  }

  function clearAll() {
    setDraftQ("");
    pushFacets({ ...EMPTY_BROWSE_FACETS });
  }

  return (
    <div className={`space-y-3 ${isPending ? "opacity-70" : ""}`}>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <form onSubmit={onSubmitSearch} className="relative min-w-0 flex-1">
          <label htmlFor="browse-facet-q" className="sr-only">
            검색
          </label>
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            id="browse-facet-q"
            type="search"
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            placeholder={searchPlaceholder(kind)}
            className="w-full rounded-full border border-border bg-beige py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink/35 outline-none transition-shadow focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
          />
        </form>

        <button
          type="button"
          onClick={openSheet}
          className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${
            selectionCount > 0
              ? "border-brand bg-brand/5 text-brand"
              : "border-border bg-white text-ink hover:bg-beige"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
            />
          </svg>
          필터
          {selectionCount > 0 ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white">
              {selectionCount}
            </span>
          ) : null}
        </button>
      </div>

      {showChips ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              disabled={isPending}
              onClick={() => onRemoveChip(chip)}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-85"
              aria-label={`${chip.label} 필터 제거`}
            >
              {chip.label}
              <svg className="h-3.5 w-3.5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ))}
          {hasBrowseFacets(facets) ? (
            <button
              type="button"
              disabled={isPending}
              onClick={clearAll}
              className="rounded-full px-2.5 py-1.5 text-sm font-medium text-ink/45 underline-offset-2 hover:text-ink hover:underline"
            >
              전체 해제
            </button>
          ) : null}
        </div>
      ) : null}

      <BrowseFilterSheet
        open={open}
        onClose={() => setOpen(false)}
        kind={kind}
        section={section}
        draft={draft}
        setDraft={setDraft}
        onApply={applySheet}
        onReset={resetSheet}
        isPending={isPending}
      />
    </div>
  );
}
