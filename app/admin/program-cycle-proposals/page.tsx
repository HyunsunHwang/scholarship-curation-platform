import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { PostPhaseLDatabase } from "@/lib/post-phase-l/database.types";

export default async function ProgramCycleProposalPage() {
  const client = await createClient() as unknown as SupabaseClient<PostPhaseLDatabase>;
  const { data: proposals } = await client
    .from("scholarship_program_cycle_proposals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <section>
      <h1 className="text-2xl font-bold text-gray-900">Program/Cycle proposals</h1>
      <p className="mt-1 text-sm text-gray-600">
        Semantic approval과 canonical approval, public projection은 서로 독립된 단계입니다.
      </p>
      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Program</th>
              <th className="px-4 py-3">Cycle</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(proposals ?? []).map((proposal) => {
              const program = proposal.proposed_program as Record<string, unknown>;
              const cycle = proposal.proposed_cycle as Record<string, unknown>;
              return (
                <tr key={proposal.id}>
                  <td className="px-4 py-3">{String(program.canonical_name ?? "—")}</td>
                  <td className="px-4 py-3">{String(cycle.cycle_label ?? "—")}</td>
                  <td className="px-4 py-3">{proposal.status}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/program-cycle-proposals/${proposal.id}`}
                      className="font-medium text-brand hover:underline">검토</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(proposals ?? []).length === 0 ? (
          <p className="p-6 text-sm text-gray-500">표시할 proposal이 없습니다.</p>
        ) : null}
      </div>
    </section>
  );
}
