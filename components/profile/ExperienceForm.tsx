"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  EXPERIENCE_KINDS,
  type ExperienceKind,
  type SpecItem,
} from "@/lib/profile-spec";
import { saveExperienceItem } from "@/app/mypage/spec-actions";
import YearMonthSelect from "@/components/profile/YearMonthSelect";
import SkillPicker from "@/components/profile/SkillPicker";
import {
  PROFILE_FILE_MAX,
  PROFILE_FILE_MAX_BYTES,
  cryptoRandomId,
  isAllowedArtifactMime,
  type SpecFileArtifact,
  type SpecLinkArtifact,
} from "@/lib/profile-artifacts";
import {
  EXPERIENCE_SKILL_MAX,
  type SkillName,
} from "@/lib/skills";

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/35 outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/15";
const labelClass = "block text-xs font-semibold text-ink/60";
const starLabelClass = "block text-xs font-bold text-brand";

function toDateInputValue(dateStr: string | null): string {
  if (!dateStr) return "";
  return dateStr.slice(0, 10);
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
  const [skills, setSkills] = useState<SkillName[]>(item?.skills ?? []);

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

  const kindDef = EXPERIENCE_KINDS.find((k) => k.type === kind) ?? EXPERIENCE_KINDS[0];
  const isEducation = kind === "education";

  const usedFileSlots = useMemo(
    () => profileFileCount + keptFiles.length + pendingFiles.length,
    [profileFileCount, keptFiles.length, pendingFiles.length]
  );
  const remainingSlots = Math.max(0, PROFILE_FILE_MAX - usedFileSlots);

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
      fd.set("skills_json", JSON.stringify(skills));
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
    <form onSubmit={submit} className="space-y-4">
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
          placeholder={
            isEducation ? "예: 데이터 분석 실무 부트캠프" : "예: AI 고객상담 자동화 인턴"
          }
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

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <span className={labelClass}>시작일</span>
          <div className="mt-1">
            <YearMonthSelect
              value={startDate}
              onChange={setStartDate}
              yearAriaLabel="시작 연도"
              monthAriaLabel="시작 월"
            />
          </div>
        </div>
        <div>
          <span className={labelClass}>종료일</span>
          <div className="mt-1">
            <YearMonthSelect
              value={endDate}
              onChange={setEndDate}
              disabled={isCurrent}
              yearAriaLabel="종료 연도"
              monthAriaLabel="종료 월"
            />
          </div>
        </div>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm text-ink/70 hover:border-brand/40">
          <input
            type="checkbox"
            checked={isCurrent}
            onChange={(e) => {
              const checked = e.target.checked;
              setIsCurrent(checked);
              if (checked) setEndDate("");
            }}
            className="h-3.5 w-3.5 rounded border-gray-300 accent-brand"
          />
          진행 중이에요
        </label>
      </div>

      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs text-ink/50">
          아래 3개가 담당자가 실제로 판단하는 핵심이에요
        </p>
      </div>

      <div>
        <label className={starLabelClass} htmlFor="exp-role">
          {isEducation ? "참여 방식·맡은 역할 *" : "내가 맡은 역할 *"}
        </label>
        <input
          id="exp-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          required
          maxLength={200}
          placeholder={
            isEducation
              ? "예: 수강생으로 참여해 팀 프로젝트의 데이터 전처리 담당"
              : "예: 3인 팀 중 프롬프트 설계·검수 담당"
          }
          className={inputClass}
        />
      </div>

      <div>
        <label className={starLabelClass} htmlFor="exp-action">
          {isEducation ? "무엇을 배우고 수행했나요?" : "구체적으로 어떻게 했나요?"}
        </label>
        <textarea
          id="exp-action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder={
            isEducation
              ? "예: Python·SQL 실습 후 실제 데이터를 분석하고 대시보드 제작"
              : "예: 자주 묻는 문의 300건을 유형화해 GPT 기반 자동 응답 프롬프트를 설계하고, 오답을 주간 리뷰로 개선"
          }
          className={`${inputClass} resize-y`}
        />
      </div>

      <div>
        <label className={starLabelClass} htmlFor="exp-result">
          {isEducation ? "수료·성과는?" : "결과는?"}{" "}
          <span className="font-medium text-ink/45">숫자·순위가 있다면 함께</span>
        </label>
        <input
          id="exp-result"
          value={result}
          onChange={(e) => setResult(e.target.value)}
          maxLength={300}
          placeholder={
            isEducation
              ? "예: 우수 수료, 최종 프로젝트 1위"
              : "예: 1차 응대 자동화율 42% 달성, 평균 응답시간 6분→40초"
          }
          className={inputClass}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className={labelClass}>사용 스킬</span>
          <span className="text-[11px] font-medium text-ink/40">
            선택 · 최대 {EXPERIENCE_SKILL_MAX}개
          </span>
        </div>
        <p className="mb-2 text-[11px] text-ink/45">
          이 경험에서 실제로 사용했던 스킬을 골라 주세요.
        </p>
        <SkillPicker
          value={skills}
          onChange={setSkills}
          max={EXPERIENCE_SKILL_MAX}
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
