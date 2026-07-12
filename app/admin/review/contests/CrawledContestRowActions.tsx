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
          const note = window.prompt("거절 사유 (선택)") ?? undefined;
          if (note === null) return;
          startTransition(async () => {
            await rejectCrawledContest(crawledId, note);
            router.refresh();
          });
        }}
        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "..." : "거절"}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("검수 대기로 되돌릴까요?")) return;
        startTransition(async () => {
          await restoreCrawledContest(crawledId);
          router.refresh();
        });
      }}
      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
    >
      {pending ? "..." : "대기로"}
    </button>
  );
}
