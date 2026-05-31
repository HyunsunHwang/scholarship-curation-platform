"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import BrandLogo from "@/components/BrandLogo";
import {
  requestPartnerAccess,
  type PartnerSignupState,
} from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/85 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "접수 중..." : "기관 담당자 가입 요청"}
    </button>
  );
}

function StatusMessage({ state }: { state: PartnerSignupState }) {
  if (!state) return null;
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        state.type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-brand/30 bg-brand/10 text-brand"
      }`}
    >
      {state.message}
    </div>
  );
}

export default function PartnerSignupClient({
  headerLogoSrc,
}: {
  headerLogoSrc?: string;
}) {
  const [state, action] = useActionState<PartnerSignupState, FormData>(
    requestPartnerAccess,
    null
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 py-12">
      <div className="mb-8 flex w-full justify-center">
        <BrandLogo
          logoSrc={headerLogoSrc}
          className="h-14 max-h-14 max-w-[min(272px,calc(100vw-4rem))] sm:h-16 sm:max-h-16 sm:max-w-[min(300px,calc(100vw-4rem))] md:h-21 md:max-h-21"
          imageClassName="object-contain object-center"
        />
      </div>

      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-ink">기관 담당자 전용 가입</h1>
        <p className="mt-2 text-sm text-ink/60">
          전달받은 링크를 통해서만 접근 가능한 가입 페이지입니다. 가입 후 관리자 승인까지 완료되어야 기관 권한이 활성화됩니다.
        </p>

        <form action={action} className="mt-6 flex flex-col gap-4">
          <StatusMessage state={state} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="applicant_name" className="text-sm font-medium text-ink">
                담당자 이름
              </label>
              <input
                id="applicant_name"
                name="applicant_name"
                type="text"
                required
                className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="organization_kind" className="text-sm font-medium text-ink">
                기관 유형
              </label>
              <select
                id="organization_kind"
                name="organization_kind"
                defaultValue=""
                required
                className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/10"
              >
                <option value="" disabled>
                  선택
                </option>
                <option value="학과">학과</option>
                <option value="학교">학교</option>
                <option value="재단">재단</option>
                <option value="기타">기타</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="organization_name" className="text-sm font-medium text-ink">
              기관명
            </label>
            <input
              id="organization_name"
              name="organization_name"
              type="text"
              required
              placeholder="예: 서울대학교 공과대학 / OO장학재단"
              className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/10"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-ink">
              이메일
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="example@email.com"
              className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/10"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-ink">
                비밀번호
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-ink">
                비밀번호 확인
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`rounded-lg border px-3.5 py-2.5 text-sm text-ink outline-none transition focus:ring-2 ${
                  passwordMismatch
                    ? "border-brand/50 focus:border-brand focus:ring-brand/20"
                    : "border-gray-200 focus:border-brand/60 focus:ring-brand/10"
                }`}
              />
              {passwordMismatch ? (
                <p className="text-xs text-brand">비밀번호가 일치하지 않습니다.</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="request_note" className="text-sm font-medium text-ink">
              요청 메모 (선택)
            </label>
            <textarea
              id="request_note"
              name="request_note"
              rows={3}
              placeholder="소속/담당 업무를 간단히 작성해주세요."
              className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/10"
            />
          </div>

          <SubmitButton />
        </form>
      </div>
    </div>
  );
}
