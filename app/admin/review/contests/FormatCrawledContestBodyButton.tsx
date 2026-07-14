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
          if (result.warning) {
            window.alert(result.warning);
          } else if (result.stageCount != null) {
            window.alert(`원문 정리 완료. 일정 ${result.stageCount}건을 선발 단계에 반영했습니다.`);
          }
          router.refresh();
        });
      }}
      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      {pending ? "정리·추출 중..." : "원문 정리·일정 추출"}
    </button>
  );
}
