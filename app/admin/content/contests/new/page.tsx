import Link from "next/link";
import ContestForm from "../ContestForm";
import { createContest } from "../actions";
import { parseContestContentKind } from "@/lib/contest-payload";
import { adminKindLabel } from "@/lib/admin-kinds";

export default async function NewContestPage({
  searchParams,
}: {
  searchParams?: Promise<{ kind?: string }>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const kind = parseContestContentKind(resolvedParams.kind ?? null, "contest");
  const returnPath = `/admin/content?kind=${kind}`;
  const kindLabel = adminKindLabel(kind);

  return (
    <div>
      <div className="mb-6">
        <Link
          href={returnPath}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← 목록으로
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{kindLabel} 추가</h1>
      </div>
      <ContestForm
        action={createContest}
        submitLabel={`${kindLabel} 등록`}
        returnPath={returnPath}
        lockedKind={kind}
      />
    </div>
  );
}
