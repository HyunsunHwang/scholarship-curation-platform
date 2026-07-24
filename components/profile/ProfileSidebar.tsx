"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { updateProfileVisibilityFlags } from "@/app/mypage/spec-actions";
import {
  matchingReadinessCopy,
  type CompletenessResult,
} from "@/lib/profile-completeness";

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-brand" : "bg-gray-200"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function CheckIcon({ done }: { done: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
        done
          ? "border-brand bg-brand text-white"
          : "border-gray-200 bg-white text-ink/25"
      }`}
      aria-hidden
    >
      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-ink/40 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

export default function ProfileSidebar({
  isProfilePublic,
  isOpenToOffers,
  completeness,
}: {
  isProfilePublic: boolean;
  isOpenToOffers: boolean;
  completeness: CompletenessResult;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [publicOn, setPublicOn] = useState(isProfilePublic);
  const [offersOn, setOffersOn] = useState(isOpenToOffers);
  const [requiredOpen, setRequiredOpen] = useState(
    completeness.requiredDone < completeness.required.length
  );
  const [optionalOpen, setOptionalOpen] = useState(true);

  useEffect(() => {
    setPublicOn(isProfilePublic);
    setOffersOn(isOpenToOffers);
  }, [isProfilePublic, isOpenToOffers]);

  function setFlag(
    key: "is_profile_public" | "is_open_to_offers",
    next: boolean
  ) {
    const prevPublic = publicOn;
    const prevOffers = offersOn;
    if (key === "is_profile_public") setPublicOn(next);
    else setOffersOn(next);

    startTransition(async () => {
      const result = await updateProfileVisibilityFlags({ [key]: next });
      if ("error" in result) {
        if (key === "is_profile_public") setPublicOn(prevPublic);
        else setOffersOn(prevOffers);
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  const segments = [
    ...completeness.required.map((i) => i.done),
    ...completeness.optional.map((i) => i.done),
  ];

  return (
    <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
      {/* 설정 */}
      <section className="rounded-2xl border border-gray-200/80 bg-white p-4 sm:p-5">
        <ul className="divide-y divide-gray-100">
          <li className="flex items-center gap-3 py-3 first:pt-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">프로필 공개</p>
              <p className="mt-0.5 truncate text-[11px] text-ink/45">
                기업·채용 담당자에게 스펙이 공개돼요
              </p>
            </div>
            <Toggle
              checked={publicOn}
              disabled={isPending}
              label="프로필 공개"
              onChange={(v) => setFlag("is_profile_public", v)}
            />
          </li>
          <li className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">제안 적극 검토</p>
              <p className="mt-0.5 truncate text-[11px] text-ink/45">
                인턴·채용 제안을 우선으로 받을게요
              </p>
            </div>
            <Toggle
              checked={offersOn}
              disabled={isPending}
              label="제안 적극 검토"
              onChange={(v) => setFlag("is_open_to_offers", v)}
            />
          </li>
          <li className="flex items-center gap-3 py-3 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">프로필 미리보기</p>
              <p className="mt-0.5 truncate text-[11px] text-ink/45">
                기업에 보이는 모습을 확인해요
              </p>
            </div>
            <Link
              href="/mypage/preview"
              className="shrink-0 text-sm font-semibold text-brand hover:text-brand/80"
            >
              미리보기
            </Link>
          </li>
        </ul>
      </section>

      {/* 매칭 준비도 */}
      <section className="rounded-2xl border border-gray-200/80 bg-white p-5">
        <h2 className="text-sm font-bold text-ink">매칭 준비도</h2>
        <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink">
          {completeness.percent}
          <span className="ml-0.5 text-lg font-bold text-ink/50">%</span>
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink/55">
          {matchingReadinessCopy(completeness.percent)}
        </p>
      </section>

      {/* 완성 체크리스트 */}
      <section className="rounded-2xl border border-gray-200/80 bg-white p-5">
        <h2 className="text-sm font-bold leading-snug text-ink">
          프로필을 채우고 맞춤 추천을 받아보세요.
        </h2>
        <div className="mt-3 flex gap-1">
          {segments.map((done, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${done ? "bg-brand" : "bg-gray-100"}`}
            />
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <div className="overflow-hidden rounded-xl bg-beige/60">
            <button
              type="button"
              onClick={() => setRequiredOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left"
            >
              <span className="text-sm font-bold text-ink">필수 입력</span>
              <span className="flex items-center gap-2 text-xs font-semibold text-ink/50">
                {completeness.requiredDone}/{completeness.required.length}
                <Chevron open={requiredOpen} />
              </span>
            </button>
            {requiredOpen ? (
              <ul className="space-y-2 px-3 pb-3">
                {completeness.required.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <CheckIcon done={item.done} />
                    <span
                      className={`flex-1 text-sm ${item.done ? "text-ink/70" : "text-ink/45"}`}
                    >
                      {item.label}
                    </span>
                    {!item.done ? (
                      <a
                        href={item.href}
                        className="text-xs font-semibold text-brand hover:text-brand/80"
                      >
                        완성하러 가기
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-100">
            <button
              type="button"
              onClick={() => setOptionalOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left"
            >
              <span className="text-sm font-bold text-ink">선택 입력</span>
              <span className="flex items-center gap-2 text-xs font-semibold text-ink/50">
                {completeness.optionalDone}/{completeness.optional.length}
                <Chevron open={optionalOpen} />
              </span>
            </button>
            {optionalOpen ? (
              <ul className="space-y-2 px-3 pb-3">
                {completeness.optional.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <CheckIcon done={item.done} />
                    <span
                      className={`flex-1 text-sm ${item.done ? "text-ink/70" : "text-ink/45"}`}
                    >
                      {item.label}
                    </span>
                    {!item.done ? (
                      <a
                        href={item.href}
                        className="text-xs font-semibold text-brand hover:text-brand/80"
                      >
                        완성하러 가기
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </section>
    </aside>
  );
}
