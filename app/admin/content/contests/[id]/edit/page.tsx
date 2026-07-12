import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContestForm from "../../ContestForm";
import { updateContest } from "../../actions";
import { parseContestContentKind } from "@/lib/contest-payload";
import { adminKindLabel } from "@/lib/admin-kinds";

export default async function EditContestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ kind?: string }>;
}) {
  const { id } = await params;
  const resolvedParams = (await searchParams) ?? {};
  const contestId = parseInt(id, 10);
  if (isNaN(contestId)) notFound();

  const supabase = await createClient();

  const [{ data: contest }, { data: stages }] = await Promise.all([
    supabase.from("contests").select("*").eq("id", contestId).single(),
    supabase
      .from("contest_selection_stages")
      .select("title, phase, schedule_date, schedule_text, note")
      .eq("contest_id", contestId)
      .order("stage_order"),
  ]);

  if (!contest) notFound();

  const kind = parseContestContentKind(
    resolvedParams.kind ?? contest.content_kind ?? null,
    "contest"
  );
  const returnPath = `/admin/content?kind=${kind}`;
  const kindLabel = adminKindLabel(kind);

  const boundAction = updateContest.bind(null, contestId);

  return (
    <div>
      <div className="mb-6">
        <Link
          href={returnPath}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← 목록으로
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">
          {kindLabel} 수정: {contest.name}
        </h1>
      </div>
      <ContestForm
        defaultValues={{
          ...contest,
          selection_stages: stages ?? [],
        }}
        action={boundAction}
        submitLabel="변경사항 저장"
        returnPath={returnPath}
        lockedKind={kind}
      />
    </div>
  );
}
