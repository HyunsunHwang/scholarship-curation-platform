"use client";

import { useTransition } from "react";
import { grantAdmin, revokeAdmin } from "./actions";

export function UserRoleButton({
  userId,
  currentRole,
  targetUserEmail,
}: {
  userId: string;
  currentRole: string;
  targetUserEmail: string;
}) {
  const [isPending, startTransition] = useTransition();
  const isAdmin = currentRole === "admin";

  const handleToggle = () => {
    if (isAdmin) {
      if (
        !confirm(
          `"${targetUserEmail}" 유저의 관리자 권한을 회수하시겠습니까?`
        )
      )
        return;
      startTransition(async () => {
        const result = await revokeAdmin(userId);
        if (result.error) alert(`오류: ${result.error}`);
      });
    } else {
      if (
        !confirm(
          `"${targetUserEmail}" 유저에게 관리자 권한을 부여하시겠습니까?\n관리자는 장학금을 생성, 수정, 삭제할 수 있습니다.`
        )
      )
        return;
      startTransition(async () => {
        const result = await grantAdmin(userId);
        if (result.error) alert(`오류: ${result.error}`);
      });
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
        isAdmin
          ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
          : "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
      }`}
    >
      {isPending ? "처리중..." : isAdmin ? "권한 회수" : "관리자 지정"}
    </button>
  );
}
