"use client";

import Link from "next/link";
import { ToggleVerifiedButton, ToggleRecommendedButton, DeleteButton } from "./ContestRowActions";
import type { ContestContentKind } from "@/lib/admin-kinds";

type ContestRow = {
  id: number;
  name: string;
  organization: string;
  apply_start_date: string | null;
  apply_end_date: string | null;
  is_verified: boolean;
  is_recommended: boolean;
  recommended_sort_order: number | null;
  content_kind: ContestContentKind;
};

type Props = {
  rows: ContestRow[];
  kind: ContestContentKind;
};

export default function ContestTable({ rows, kind }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-400">
        등록된 항목이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              이름 / 기관
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              신청 기간
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              검증
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              추천
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
              액션
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900 line-clamp-1">{row.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{row.organization}</p>
              </td>
              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                {row.apply_start_date && row.apply_end_date
                  ? `${row.apply_start_date} ~ ${row.apply_end_date}`
                  : row.apply_end_date
                  ? `~ ${row.apply_end_date}`
                  : row.apply_start_date
                  ? `${row.apply_start_date} ~`
                  : "—"}
              </td>
              <td className="px-4 py-3">
                <ToggleVerifiedButton id={row.id} isVerified={row.is_verified} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <ToggleRecommendedButton id={row.id} isRecommended={row.is_recommended} />
                  {row.recommended_sort_order != null && (
                    <span className="text-xs text-gray-400">#{row.recommended_sort_order}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Link
                    href={`/admin/content/contests/${row.id}/edit?kind=${kind}`}
                    className="px-3 py-1 text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    수정
                  </Link>
                  <DeleteButton id={row.id} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
