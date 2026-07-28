import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { PostPhaseLDatabase } from "@/lib/post-phase-l/database.types";

export default async function AnalysisReviewPage() {
  const client = await createClient() as unknown as SupabaseClient<PostPhaseLDatabase>;
  const [{ data: jobs }, { data: runs }, { data: results }, { data: reviews }] = await Promise.all([
    client.from("notice_analysis_jobs").select("*").order("created_at", { ascending: false }).limit(100),
    client.from("notice_analysis_runs").select("*").order("created_at", { ascending: false }).limit(200),
    client.from("notice_analysis_results").select("*").order("created_at", { ascending: false }).limit(100),
    client.from("notice_analysis_review_events").select("*").order("reviewed_at", { ascending: false }).limit(200),
  ]);
  const resultByJob = new Map((results ?? []).map((row) => [row.job_id, row]));
  const latestRunByJob = new Map<string, NonNullable<typeof runs>[number]>();
  for (const run of runs ?? []) {
    if (!latestRunByJob.has(run.job_id)) latestRunByJob.set(run.job_id, run);
  }
  const latestReviewByResult = new Map<string, (typeof reviews extends (infer R)[] | null ? R : never)>();
  for (const review of reviews ?? []) {
    if (!latestReviewByResult.has(review.result_id)) latestReviewByResult.set(review.result_id, review);
  }

  return (
    <section>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Semantic analysis review</h1>
        <p className="mt-1 text-sm text-gray-600">
          분석 상태와 검증 결과를 확인합니다. 승인은 public 또는 canonical write를 발생시키지 않습니다.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Revision</th>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Validation</th>
              <th className="px-4 py-3">Review</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(jobs ?? []).map((job) => {
              const result = resultByJob.get(job.id);
              const run = latestRunByJob.get(job.id);
              const review = result ? latestReviewByResult.get(result.id) : null;
              return (
                <tr key={job.id}>
                  <td className="px-4 py-3 font-mono text-xs">{job.revision_id.slice(0, 12)}</td>
                  <td className="px-4 py-3">{job.status}</td>
                  <td className="px-4 py-3">
                    {result?.result_status ?? run?.validation_status ?? "—"}
                    {run?.error_code ? <p className="text-xs text-red-600">{run.error_code}</p> : null}
                  </td>
                  <td className="px-4 py-3">{review?.decision ?? "pending"}</td>
                  <td className="px-4 py-3">
                    {result ? (
                      <Link className="font-medium text-brand hover:underline" href={`/admin/analysis-review/${result.id}`}>
                        검토
                      </Link>
                    ) : (
                      <span className="text-gray-400">결과 없음</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(jobs ?? []).length === 0 ? (
          <p className="p-6 text-sm text-gray-500">표시할 분석 작업이 없습니다.</p>
        ) : null}
      </div>
    </section>
  );
}
