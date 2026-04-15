"use client";

import { useState } from "react";
import Link from "next/link";
import { ToggleVerifiedButton, DeleteButton } from "./ScholarshipRowActions";

type ScholarshipRow = {
  id: number;
  name: string;
  organization: string;
  apply_start_date: string;
  apply_end_date: string;
  support_amount: number;
  is_verified: boolean;
  support_types: string[];
};

export default function ScholarshipTable({
  scholarships,
}: {
  scholarships: ScholarshipRow[];
}) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? scholarships.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.organization.toLowerCase().includes(q)
      )
    : scholarships;

  return (
    <>
      <div className="relative mb-4">
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="장학금 이름 또는 기관명으로 검색..."
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {q && (
        <p className="mb-3 text-xs text-gray-500">
          검색 결과: <span className="font-semibold text-gray-700">{filtered.length}</span>건
        </p>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">이름 / 기관</th>
              <th className="px-4 py-3">지원 유형</th>
              <th className="px-4 py-3">지원금액</th>
              <th className="px-4 py-3">신청 기간</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length > 0 ? (
              filtered.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{s.name}</p>
                    <p className="text-gray-500 text-xs">{s.organization}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.support_types.map((t) => (
                        <span
                          key={t}
                          className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {s.support_amount.toLocaleString()}원
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.apply_start_date} ~<br />
                    {s.apply_end_date}
                  </td>
                  <td className="px-4 py-3">
                    <ToggleVerifiedButton id={s.id} isVerified={s.is_verified} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/scholarships/${s.id}/edit`}
                        className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        수정
                      </Link>
                      <DeleteButton id={s.id} name={s.name} />
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  {q ? (
                    <>
                      <span className="font-medium">&ldquo;{query}&rdquo;</span>에 대한 검색 결과가 없습니다.
                    </>
                  ) : (
                    <>
                      등록된 장학금이 없습니다.{" "}
                      <Link
                        href="/admin/scholarships/new"
                        className="text-blue-600 hover:underline"
                      >
                        첫 장학금을 추가해보세요.
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
