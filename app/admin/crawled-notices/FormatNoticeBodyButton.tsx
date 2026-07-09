"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatNoticeBody } from "./actions";

type Props = {
  noticeId: number;
};

export default function FormatNoticeBodyButton({ noticeId }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await formatNoticeBody(noticeId);
          if (result?.error) {
            alert(`원문 형식 정리 실패: ${result.error}`);
            return;
          }
          router.refresh();
        });
      }}
      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? "원문 정리 중..." : "원문 형식 정리"}
    </button>
  );
}
