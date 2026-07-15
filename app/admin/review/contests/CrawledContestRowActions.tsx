"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  rejectCrawledContest,
  restoreCrawledContest,
} from "./actions";

export default function CrawledContestRowActions({
  crawledId,
  status,
}: {
  crawledId: number;
  status: "new" | "promoted" | "rejected";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (status === "new") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const note = window.prompt("거절 사유 (선택)");
          if (note === null) return;
          startTransition(async () => {
            const result = await rejectCrawledContest(crawledId, note);
            if (result?.error) {
              alert(`오류: ${result.error}`);
              return;
            }
            router.refresh();
          });
        }}
        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "..." : "거절"}
      </button>
    );
  }

  if (status === "promoted") {
    return (
      <span className="text-xs font-medium text-emerald-700" title="연결된 콘텐츠에서 관리합니다.">
        발행 완료
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("검수 대기로 되돌릴까요?")) return;
        startTransition(async () => {
          const result = await restoreCrawledContest(crawledId);
          if (result?.error) {
            alert(`오류: ${result.error}`);
            return;
          }
          router.refresh();
        });
      }}
      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
    >
      {pending ? "..." : "대기로"}
    </button>
  );
}
