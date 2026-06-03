"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { rejectNotice, restoreNotice } from "./actions";

type Props = {
  noticeId: number;
  status: "new" | "promoted" | "rejected";
};

export default function CrawledNoticeRowActions({ noticeId, status }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleReject = () => {
    const note = window.prompt("거절 사유(선택)를 입력하세요.", "");
    if (note === null) return; // 취소
    startTransition(async () => {
      const result = await rejectNotice(noticeId, note);
      if (result?.error) {
        alert(`오류: ${result.error}`);
        return;
      }
      router.refresh();
    });
  };

  const handleRestore = () => {
    startTransition(async () => {
      const result = await restoreNotice(noticeId);
      if (result?.error) {
        alert(`오류: ${result.error}`);
        return;
      }
      router.refresh();
    });
  };

  if (status === "new") {
    return (
      <button
        type="button"
        onClick={handleReject}
        disabled={isPending}
        className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        거절
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleRestore}
      disabled={isPending}
      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
    >
      검수대기로
    </button>
  );
}
