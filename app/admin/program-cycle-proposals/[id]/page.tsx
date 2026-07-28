import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { PostPhaseLDatabase } from "@/lib/post-phase-l/database.types";
import {
  projectApprovedCycle,
  reviewProgramCycleProposal,
} from "../actions";

export default async function ProgramCycleProposalDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await createClient() as unknown as SupabaseClient<PostPhaseLDatabase>;
  const { data: proposal } = await client
    .from("scholarship_program_cycle_proposals").select("*").eq("id", id).maybeSingle();
  if (!proposal) notFound();
  const [revision, result, semanticReview, programs, cycles, events, projection] =
    await Promise.all([
      client.from("ingestion_notice_revisions").select("*").eq("id", proposal.revision_id).single(),
      client.from("notice_analysis_results").select("*").eq("id", proposal.analysis_result_id).single(),
      client.from("notice_analysis_review_events").select("*")
        .eq("id", proposal.analysis_review_event_id).single(),
      client.from("scholarship_programs").select("*").order("canonical_name"),
      client.from("scholarship_cycles").select("*").order("created_at", { ascending: false }),
      client.from("scholarship_proposal_review_events").select("*")
        .eq("proposal_id", proposal.id).order("created_at", { ascending: false }),
      proposal.canonical_cycle_id
        ? client.from("scholarship_projection_links").select("*")
          .eq("cycle_id", proposal.canonical_cycle_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
  const proposedProgram = JSON.stringify(proposal.proposed_program, null, 2);
  const proposedCycle = JSON.stringify(proposal.proposed_cycle, null, 2);
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Program/Cycle proposal review</h1>
        <p className="mt-1 font-mono text-xs text-gray-500">{proposal.id}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">Notice Revision</h2>
          <h3 className="mt-3 text-sm font-medium">{revision.data?.title}</h3>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs">
            {revision.data?.body ?? "본문 없음"}
          </pre>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">Semantic effective output</h2>
          <p className="mt-2 text-xs text-gray-500">
            Review: {semanticReview.data?.decision} · Result: {result.data?.result_status}
          </p>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs">
            {JSON.stringify(semanticReview.data?.effective_output, null, 2)}
          </pre>
        </article>
      </div>
      <form action={reviewProgramCycleProposal}
        className="rounded-xl border border-gray-200 bg-white p-5">
        <input type="hidden" name="proposal_id" value={proposal.id} />
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-medium">Program patch
            <textarea name="program_patch" defaultValue={proposedProgram}
              className="mt-2 min-h-72 w-full rounded-lg border p-3 font-mono text-xs" />
          </label>
          <label className="text-sm font-medium">Cycle patch
            <textarea name="cycle_patch" defaultValue={proposedCycle}
              className="mt-2 min-h-72 w-full rounded-lg border p-3 font-mono text-xs" />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm">Existing Program
            <select name="existing_program_id" className="mt-1 w-full rounded-lg border p-2">
              <option value="">선택 안 함</option>
              {(programs.data ?? []).map((program) => (
                <option key={program.id} value={program.id}>
                  {program.canonical_name} · {program.operating_organization ?? "기관 미상"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">Existing Cycle
            <select name="existing_cycle_id" className="mt-1 w-full rounded-lg border p-2">
              <option value="">선택 안 함</option>
              {(cycles.data ?? []).map((cycle) => (
                <option key={cycle.id} value={cycle.id}>{cycle.cycle_label}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-4 block text-sm">Reason
          <input name="reason" className="mt-1 w-full rounded-lg border p-2" />
        </label>
        {proposal.status === "pending" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["approve_new_program_and_cycle", "신규 Program + Cycle"],
              ["approve_existing_program_new_cycle", "기존 Program + 신규 Cycle"],
              ["approve_existing_program_existing_cycle", "기존 Program/Cycle 연결"],
              ["needs_revision", "수정 필요"],
              ["reject", "거절"],
            ].map(([value, label]) => (
              <button key={value} name="decision" value={value}
                className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50">
                {label}
              </button>
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-gray-500">처리 상태: {proposal.status}</p>}
      </form>
      {proposal.canonical_cycle_id ? (
        <form action={projectApprovedCycle}
          className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <input type="hidden" name="proposal_id" value={proposal.id} />
          <input type="hidden" name="cycle_id" value={proposal.canonical_cycle_id} />
          <h2 className="font-semibold">Scholarships compatibility projection</h2>
          <p className="mt-1 text-sm text-gray-600">
            생성 row는 is_verified=false, list_on_home=false이며 자동 공개되지 않습니다.
          </p>
          {projection.data ? (
            <p className="mt-3 text-sm">Projection 완료: scholarship #{projection.data.scholarship_id}</p>
          ) : (
            <button className="mt-3 rounded-lg border border-amber-400 px-3 py-2 text-sm font-medium">
              승인 Cycle을 hidden scholarship으로 projection
            </button>
          )}
        </form>
      ) : null}
      <article className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold">Proposal review history</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(events.data ?? []).map((event) => (
            <li key={event.id}>{event.created_at} · {event.decision} · {event.reason ?? "사유 없음"}</li>
          ))}
        </ul>
      </article>
    </section>
  );
}
