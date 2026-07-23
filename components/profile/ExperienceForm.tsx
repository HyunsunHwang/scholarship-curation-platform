"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  EXPERIENCE_KINDS,
  formatSpecDate,
  type ExperienceKind,
  type SpecItem,
} from "@/lib/profile-spec";
import { saveExperienceItem } from "@/app/mypage/spec-actions";
import {
  polishExperience,
  type ExperienceCard,
} from "@/app/mypage/experience-ai-actions";
import DatePicker from "@/components/profile/DatePicker";
import {
  PROFILE_FILE_MAX,
  PROFILE_FILE_MAX_BYTES,
  cryptoRandomId,
  isAllowedArtifactMime,
  type SpecFileArtifact,
  type SpecLinkArtifact,
} from "@/lib/profile-artifacts";

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/15";
const labelClass = "block text-xs font-semibold text-ink/60";
const starLabelClass = "block text-xs font-bold text-brand";

function toDateInputValue(dateStr: string | null): string {
  if (!dateStr) return "";
  return dateStr.slice(0, 10);
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.9 5.3L19 9l-5.1 1.7L12 16l-1.9-5.3L5 9l5.1-1.7L12 2zm7 11l.95 2.65L22.5 16.5l-2.55.85L19 20l-.95-2.65-2.55-.85 2.55-.85L19 13zM5 14l.8 2.2 2.2.8-2.2.8L5 20l-.8-2.2-2.2-.8 2.2-.8L5 14z" />
    </svg>
  );
}

type DraftLink = { id: string; url: string; title: string };
type PendingFile = { id: string; file: File };

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

export default function ExperienceForm({
  item,
  initialKind,
  profileFileCount,
  onClose,
}: {
  item: SpecItem | null;
  initialKind: ExperienceKind;
  /** 이 항목을 제외한 프로필 전체 파일 수 */
  profileFileCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isPolishing, startPolish] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<ExperienceKind>(initialKind);
  const [title, setTitle] = useState(item?.title ?? "");
  const [organization, setOrganization] = useState(item?.organization ?? "");
  const [startDate, setStartDate] = useState(toDateInputValue(item?.start_date ?? null));
  const [endDate, setEndDate] = useState(toDateInputValue(item?.end_date ?? null));
  const [isCurrent, setIsCurrent] = useState(item?.is_current ?? false);

  const [role, setRole] = useState(item?.star_role ?? "");
  const [action, setAction] = useState(
    item?.star_action ?? (item?.star_role ? "" : item?.description ?? "")
  );
  const [result, setResult] = useState(item?.star_result ?? "");

  const initialLinks: DraftLink[] = (item?.artifacts ?? [])
    .filter((a): a is SpecLinkArtifact => a.kind === "link")
    .map((a) => ({ id: a.id, url: a.url, title: a.title ?? "" }));
  const initialFiles = (item?.artifacts ?? []).filter(
    (a): a is SpecFileArtifact => a.kind === "file"
  );

  const [links, setLinks] = useState<DraftLink[]>(
    initialLinks.length > 0 ? initialLinks : []
  );
  const [keptFiles, setKeptFiles] = useState<SpecFileArtifact[]>(initialFiles);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [linkDraft, setLinkDraft] = useState({ url: "", title: "" });

  const [card, setCard] = useState<ExperienceCard | null>(null);

  const kindDef = EXPERIENCE_KINDS.find((k) => k.type === kind) ?? EXPERIENCE_KINDS[0];

  const usedFileSlots = useMemo(
    () => profileFileCount + keptFiles.length + pendingFiles.length,
    [profileFileCount, keptFiles.length, pendingFiles.length]
  );
  const remainingSlots = Math.max(0, PROFILE_FILE_MAX - usedFileSlots);

  function periodText(): string {
    const start = formatSpecDate(startDate || null);
    if (!start) return "";
    if (isCurrent) return `${start} – 진행 중`;
    const end = formatSpecDate(endDate || null);
    return end ? `${start} – ${end}` : start;
  }

  function polish() {
    setError(null);
    if (!title.trim() || !role.trim()) {
      setError("제목과 내가 맡은 역할을 먼저 입력해 주세요.");
      return;
    }
    startPolish(async () => {
      const res = await polishExperience({
        item_type: kind,
        title,
        organization,
        period: periodText(),
        star_role: role,
        star_action: action,
        star_result: result,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setCard(res.card);
    });
  }

  function applyCard() {
    if (!card) return;
    setRole(card.star_role);
    if (card.star_action) setAction(card.star_action);
    if (card.star_result) setResult(card.star_result);
    setCard(null);
  }

  function addLink() {
    const url = linkDraft.url.trim();
    if (!url) {
      setError("링크 URL을 입력해 주세요.");
      return;
    }
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad");
    } catch {
      setError("http(s)로 시작하는 올바른 URL을 입력해 주세요.");
      return;
    }
    setError(null);
    setLinks((prev) => [
      ...prev,
      { id: cryptoRandomId(), url, title: linkDraft.title.trim() },
    ]);
    setLinkDraft({ url: "", title: "" });
  }

  function onPickFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next: PendingFile[] = [];
    let err: string | null = null;
    let slots = remainingSlots;

    for (const file of Array.from(fileList)) {
      if (slots <= 0) {
        err = `프로필에 첨부할 수 있는 파일은 최대 ${PROFILE_FILE_MAX}개입니다.`;
        break;
      }
      if (file.size > PROFILE_FILE_MAX_BYTES) {
        err = `"${file.name}" 파일이 10MB를 초과합니다.`;
        continue;
      }
      if (!isAllowedArtifactMime(file.type)) {
        err = `"${file.name}" 형식을 지원하지 않습니다. PDF·이미지·문서만 올려 주세요.`;
        continue;
      }
      next.push({ id: cryptoRandomId(), file });
      slots -= 1;
    }

    if (next.length) {
      setPendingFiles((prev) => [...prev, ...next]);
    }
    if (err) setError(err);
    else setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      if (item?.id) fd.set("id", item.id);
      fd.set("item_type", kind);
      fd.set("title", title);
      fd.set("organization", organization);
      fd.set("start_date", startDate);
      fd.set("end_date", endDate);
      fd.set("is_current", isCurrent ? "1" : "0");
      fd.set("star_role", role);
      fd.set("star_action", action);
      fd.set("star_result", result);
      fd.set(
        "links_json",
        JSON.stringify(
          links.map((l) => ({ id: l.id, kind: "link", url: l.url, title: l.title || null }))
        )
      );
      fd.set(
        "keep_file_ids_json",
        JSON.stringify(keptFiles.map((f) => f.id))
      );
      for (const p of pendingFiles) {
        fd.append("files", p.file, p.file.name);
      }

      const res = await saveExperienceItem(fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div>
        <p className="text-xs text-ink/50">
          <span className="font-semibold text-ink/70">종류</span> — 분류·추천에만
          쓰여요. 입력 항목은 동일해요.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {EXPERIENCE_KINDS.map((k) => {
            const active = k.type === kind;
            return (
              <button
                key={k.type}
                type="button"
                onClick={() => setKind(k.type)}
                aria-pressed={active}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? "border-ink bg-ink text-white"
                    : "border-gray-200 bg-white text-ink/70 hover:border-ink/40"
                }`}
              >
                {k.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="exp-title">
          제목 *
        </label>
        <input
          id="exp-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={120}
          placeholder="예: AI 고객상담 자동화 인턴"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="exp-org">
          어디서
        </label>
        <input
          id="exp-org"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          maxLength={120}
          placeholder={kindDef.wherePlaceholder}
          className={inputClass}
        />
      </div>

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
        <label className="mt-2 flex items-center gap-2 text-xs text-ink/60">
          <input
            type="checkbox"
            checked={isCurrent}
            onChange={(e) => setIsCurrent(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 accent-brand"
          />
          진행 중
        </label>
      </div>

      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs text-ink/50">
          아래 3개가 담당자가 실제로 판단하는 핵심이에요
        </p>
      </div>

      <div>
        <label className={starLabelClass} htmlFor="exp-role">
          내가 맡은 역할 *
        </label>
        <input
          id="exp-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          required
          maxLength={200}
          placeholder="예: 3인 팀 중 프롬프트 설계·검수 담당"
          className={inputClass}
        />
      </div>

      <div>
        <label className={starLabelClass} htmlFor="exp-action">
          구체적으로 어떻게 했나요?
        </label>
        <textarea
          id="exp-action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="예: 자주 묻는 문의 300건을 유형화해 GPT 기반 자동 응답 프롬프트를 설계하고, 오답을 주간 리뷰로 개선"
          className={`${inputClass} resize-y`}
        />
      </div>

      <div>
        <label className={starLabelClass} htmlFor="exp-result">
          결과는?{" "}
          <span className="font-medium text-ink/45">숫자·순위가 있다면 함께</span>
        </label>
        <input
          id="exp-result"
          value={result}
          onChange={(e) => setResult(e.target.value)}
          maxLength={300}
          placeholder="예: 1차 응대 자동화율 42% 달성, 평균 응답시간 6분→40초"
          className={inputClass}
        />
      </div>

      {/* 결과물 첨부 — 담당자 카드/공유에도 노출 예정 */}
      <div className="space-y-3 rounded-xl border border-gray-100 bg-cream/40 p-3">
        <div>
          <p className={starLabelClass}>결과물 첨부</p>
          <p className="mt-0.5 text-[11px] text-ink/45">
            링크·파일은 나중에 담당자 카드·공유에도 보여져요. 파일은 프로필 전체{" "}
            {PROFILE_FILE_MAX}개까지 ({usedFileSlots}/{PROFILE_FILE_MAX})
          </p>
        </div>

        <div className="space-y-2">
          <p className={labelClass}>링크</p>
          {links.length > 0 ? (
            <ul className="space-y-1.5">
              {links.map((l) => (
                <li
                  key={l.id}
                  className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">
                      {l.title || l.url}
                    </p>
                    {l.title ? (
                      <p className="truncate text-xs text-ink/45">{l.url}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLinks((prev) => prev.filter((x) => x.id !== l.id))}
                    className="shrink-0 text-xs font-semibold text-ink/45 hover:text-red-600"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_auto]">
            <input
              value={linkDraft.url}
              onChange={(e) => setLinkDraft((d) => ({ ...d, url: e.target.value }))}
              placeholder="https://…"
              className={inputClass}
            />
            <input
              value={linkDraft.title}
              onChange={(e) => setLinkDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="제목(선택)"
              maxLength={120}
              className={inputClass}
            />
            <button
              type="button"
              onClick={addLink}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-ink/70 hover:border-ink/40"
            >
              추가
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className={labelClass}>파일</p>
          {keptFiles.length + pendingFiles.length > 0 ? (
            <ul className="space-y-1.5">
              {keptFiles.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate font-medium text-brand hover:underline"
                  >
                    {f.name}
                  </a>
                  <span className="shrink-0 text-xs text-ink/40">
                    {f.size != null ? formatBytes(f.size) : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setKeptFiles((prev) => prev.filter((x) => x.id !== f.id))
                    }
                    className="shrink-0 text-xs font-semibold text-ink/45 hover:text-red-600"
                  >
                    삭제
                  </button>
                </li>
              ))}
              {pendingFiles.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-brand/30 bg-brand/5 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">
                    {p.file.name}
                  </span>
                  <span className="shrink-0 text-xs text-ink/40">
                    {formatBytes(p.file.size)} · 저장 시 업로드
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingFiles((prev) => prev.filter((x) => x.id !== p.id))
                    }
                    className="shrink-0 text-xs font-semibold text-ink/45 hover:text-red-600"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <label
            className={`flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-ink/60 hover:border-brand/40 hover:text-brand ${
              remainingSlots <= 0 ? "pointer-events-none opacity-40" : ""
            }`}
          >
            파일 선택 (PDF·이미지·PPT/Word, 최대 10MB)
            <input
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.ppt,.pptx,application/pdf,image/*"
              disabled={remainingSlots <= 0}
              onChange={(e) => {
                onPickFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {card ? (
        <div className="rounded-xl border border-brand/25 bg-brand/5 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-brand">
            담당자 카드 미리보기
          </p>
          <p className="mt-1.5 text-sm font-bold text-ink">{card.headline}</p>
          <dl className="mt-2 space-y-1 text-sm text-ink/75">
            <div className="flex gap-2">
              <dt className="shrink-0 font-semibold text-ink/50">역할</dt>
              <dd>{card.star_role}</dd>
            </div>
            {card.star_action ? (
              <div className="flex gap-2">
                <dt className="shrink-0 font-semibold text-ink/50">행동</dt>
                <dd>{card.star_action}</dd>
              </div>
            ) : null}
            {card.star_result ? (
              <div className="flex gap-2">
                <dt className="shrink-0 font-semibold text-ink/50">결과</dt>
                <dd className="font-semibold text-ink">{card.star_result}</dd>
              </div>
            ) : null}
          </dl>
          {(links.length > 0 || keptFiles.length + pendingFiles.length > 0) ? (
            <p className="mt-2 text-xs text-ink/45">
              첨부 {links.length + keptFiles.length + pendingFiles.length}개도
              카드에 함께 노출될 예정이에요.
            </p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCard(null)}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink/55 hover:bg-white"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={applyCard}
              className="rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand/85"
            >
              이대로 적용
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={polish}
          disabled={isPolishing}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand/10 px-4 py-3 text-sm font-semibold text-brand transition-colors hover:bg-brand/15 disabled:opacity-60"
        >
          <SparkleIcon className="h-4 w-4" />
          {isPolishing ? "정리하는 중…" : "AI로 정리하고 담당자 카드 미리보기"}
        </button>
      )}

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
