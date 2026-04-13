"use client";

import { useTransition } from "react";
import { deleteScholarship, toggleVerified } from "./actions";

export function ToggleVerifiedButton({
  id,
  isVerified,
}: {
  id: number;
  isVerified: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => toggleVerified(id, isVerified))}
      disabled={isPending}
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
        isVerified
          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {isPending ? "처리중..." : isVerified ? "검증됨" : "미검증"}
    </button>
  );
}

export function DeleteButton({ id, name }: { id: number; name: string }) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (!confirm(`"${name}" 장학금을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    startTransition(() => deleteScholarship(id));
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="px-3 py-1 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
    >
      {isPending ? "삭제중..." : "삭제"}
    </button>
  );
}
