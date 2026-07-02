"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateNoticeDraft } from "./actions";

type Props = {
  noticeId: number;
};

export default function GenerateDraftButton({ noticeId }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await generateNoticeDraft(noticeId);
          if (result?.error) {
            alert(`AI 초안 생성 실패: ${result.error}`);
            return;
          }
          router.refresh();
        });
      }}
      className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? "AI 초안 생성 중..." : "AI 초안 생성"}
    </button>
  );
}
