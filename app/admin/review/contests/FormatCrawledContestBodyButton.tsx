"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCrawledContestBody } from "./actions";

export default function FormatCrawledContestBodyButton({
  crawledId,
}: {
  crawledId: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await formatCrawledContestBody(crawledId);
          if (result.error) {
            window.alert(result.error);
            return;
          }
          router.refresh();
        });
      }}
      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      {pending ? "정리 중..." : "본문 형식 정리"}
    </button>
  );
}
