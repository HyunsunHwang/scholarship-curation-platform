"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { login, signup, type AuthState } from "./actions";

type Tab = "login" | "signup";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "처리 중..." : label}
    </button>
  );
}

function StatusMessage({ state }: { state: AuthState }) {
  if (!state) return null;
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        state.type === "success"
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {state.message}
    </div>
  );
}

function LoginForm() {
  const [state, action] = useActionState<AuthState, FormData>(login, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <StatusMessage state={state} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-email" className="text-sm font-medium text-gray-700">
          이메일
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="example@email.com"
          required
          className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="login-password" className="text-sm font-medium text-gray-700">
            비밀번호
          </label>
        </div>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="비밀번호 입력"
          required
          className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <SubmitButton label="로그인" />
    </form>
  );
}

function SignupForm() {
  const [state, action] = useActionState<AuthState, FormData>(signup, null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <form action={action} className="flex flex-col gap-4">
      <StatusMessage state={state} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-email" className="text-sm font-medium text-gray-700">
          이메일
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="example@email.com"
          required
          className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-password" className="text-sm font-medium text-gray-700">
          비밀번호
          <span className="ml-1.5 text-xs font-normal text-gray-400">
            (8자 이상)
          </span>
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="비밀번호 입력"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-confirm" className="text-sm font-medium text-gray-700">
          비밀번호 확인
        </label>
        <input
          id="signup-confirm"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="비밀번호 재입력"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={`rounded-lg border px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:ring-2 ${
            passwordMismatch
              ? "border-red-300 focus:border-red-400 focus:ring-red-100"
              : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"
          }`}
        />
        {passwordMismatch && (
          <p className="text-xs text-red-500">비밀번호가 일치하지 않습니다.</p>
        )}
      </div>

      <SubmitButton label="회원가입" />

      <p className="text-center text-xs text-gray-400">
        가입 시{" "}
        <Link href="#" className="text-indigo-600 hover:underline">
          서비스 이용약관
        </Link>
        {" "}및{" "}
        <Link href="#" className="text-indigo-600 hover:underline">
          개인정보처리방침
        </Link>
        에 동의하는 것으로 간주됩니다.
      </p>
    </form>
  );
}

export default function AuthPage() {
  const [tab, setTab] = useState<Tab>("login");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
      {/* 로고 */}
      <Link href="/" className="mb-8 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
          <span className="text-base font-bold text-white">K</span>
        </div>
        <span className="text-xl font-bold tracking-tight text-gray-900">
          쿠넥트
        </span>
      </Link>

      {/* 카드 */}
      <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        {/* 탭 */}
        <div className="mb-6 flex rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setTab("login")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
              tab === "login"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => setTab("signup")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
              tab === "signup"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            회원가입
          </button>
        </div>

        {/* 폼 */}
        {tab === "login" ? <LoginForm /> : <SignupForm />}
      </div>

      {/* 하단 링크 */}
      <p className="mt-6 text-sm text-gray-500">
        {tab === "login" ? (
          <>
            아직 계정이 없으신가요?{" "}
            <button
              type="button"
              onClick={() => setTab("signup")}
              className="font-medium text-indigo-600 hover:underline"
            >
              회원가입
            </button>
          </>
        ) : (
          <>
            이미 계정이 있으신가요?{" "}
            <button
              type="button"
              onClick={() => setTab("login")}
              className="font-medium text-indigo-600 hover:underline"
            >
              로그인
            </button>
          </>
        )}
      </p>
    </div>
  );
}
