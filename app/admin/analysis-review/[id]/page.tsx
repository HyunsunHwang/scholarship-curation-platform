import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { PostPhaseLDatabase } from "@/lib/post-phase-l/database.types";
import { recordAnalysisReview } from "../actions";

export default async function AnalysisResultReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await createClient() as unknown as SupabaseClient<PostPhaseLDatabase>;
  const { data: result } = await client
    .from("notice_analysis_results")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!result) notFound();
  const [{ data: revision }, { data: evidence }, { data: reviews }] = await Promise.all([
    client.from("ingestion_notice_revisions").select("*").eq("id", result.revision_id).single(),
    client.from("notice_analysis_evidence").select("*").eq("result_id", result.id).order("field_path"),
    client.from("notice_analysis_review_events").select("*").eq("result_id", result.id)
      .order("reviewed_at", { ascending: false }),
  ]);
  const structured = JSON.stringify(result.structured_result, null, 2);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Semantic result review</h1>
        <p className="mt-1 font-mono text-xs text-gray-500">{result.revision_id}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">Durable Revision</h2>
          <h3 className="mt-4 text-sm font-medium">{revision?.title}</h3>
          <pre className="mt-3 max-h-[34rem] overflow-auto whitespace-pre-wrap text-xs text-gray-700">
            {revision?.body ?? "본문 없음"}
          </pre>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">Validated output</h2>
          <pre className="mt-3 max-h-[34rem] overflow-auto whitespace-pre-wrap text-xs text-gray-700">
            {structured}
          </pre>
        </article>
      </div>
      <article className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900">Field evidence</h2>
        <div className="mt-3 space-y-3">
          {(evidence ?? []).map((entry) => (
            <div key={entry.id} className="rounded-lg bg-gray-50 p-3 text-sm">
              <p className="font-mono text-xs font-semibold">{entry.field_path}</p>
              <p className="mt-1 text-gray-700">“{entry.quoted_text}”</p>
              <p className="mt-1 text-xs text-gray-500">{entry.source_locator}</p>
            </div>
          ))}
        </div>
      </article>
      <form action={recordAnalysisReview} className="rounded-xl border border-gray-200 bg-white p-5">
        <input type="hidden" name="result_id" value={result.id} />
        <h2 className="font-semibold text-gray-900">관리자 결정</h2>
        <label className="mt-4 block text-sm font-medium" htmlFor="corrected_output">수정 결과 JSON</label>
        <textarea id="corrected_output" name="corrected_output" defaultValue={structured}
          className="mt-2 min-h-80 w-full rounded-lg border border-gray-300 p-3 font-mono text-xs" />
        <label className="mt-4 block text-sm font-medium" htmlFor="reason">사유</label>
        <input id="reason" name="reason" className="mt-2 w-full rounded-lg border border-gray-300 p-2" />
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["approve", "승인"],
            ["reject", "거절"],
            ["needs_revision", "수정 필요"],
            ["reanalysis_requested", "재분석 요청"],
          ].map(([value, label]) => (
            <button key={value} name="decision" value={value}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50">
              {label}
            </button>
          ))}
        </div>
      </form>
      <article className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900">Review history</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(reviews ?? []).map((review) => (
            <li key={review.id}>{review.reviewed_at} · {review.decision} · {review.reason ?? "사유 없음"}</li>
          ))}
        </ul>
      </article>
    </section>
  );
}
