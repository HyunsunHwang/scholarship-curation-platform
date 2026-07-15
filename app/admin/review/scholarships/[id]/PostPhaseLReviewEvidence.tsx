import type { PostPhaseLReviewEvidence as Evidence } from "@/lib/post-phase-l/admin-review";

function stateClass(state: string) {
  if (["match", "success", "approve", "preview_eligible", "verified"].includes(state)) {
    return "bg-emerald-100 text-emerald-800";
  }
  if (["mismatch", "blocked", "reject", "hidden", "unavailable"].some((value) => state.includes(value))) {
    return "bg-red-100 text-red-800";
  }
  return "bg-amber-100 text-amber-900";
}

export default function PostPhaseLReviewEvidence({ evidence }: { evidence: Evidence }) {
  if (evidence.mode === "inactive") return null;
  if (evidence.mode === "unavailable") {
    return (
      <section className="mb-6 border-y border-red-200 bg-red-50 px-4 py-4 text-sm text-red-950">
        <p className="font-semibold">L graph evidence unavailable</p>
        <p className="mt-1 text-red-800">{evidence.errorCode}</p>
        <p className="mt-1 text-red-800">공개 projection preview는 닫힌 상태입니다.</p>
      </section>
    );
  }

  return (
    <section className="mb-6 border-y border-gray-300 bg-white py-5" aria-label="Post-Phase L graph evidence">
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500">DB-backed Post-Phase L</p>
          <h2 className="mt-1 text-lg font-bold text-gray-900">Graph, review event, projection preview</h2>
        </div>
        <span className={`rounded-md px-2 py-1 text-xs font-semibold ${stateClass(evidence.preview.exposurePolicyResult)}`}>
          {evidence.preview.exposurePolicyResult}
        </span>
      </div>

      <dl className="mt-4 grid gap-x-5 gap-y-3 border-y border-gray-200 bg-gray-50 px-4 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs text-gray-500">Canonical source</dt><dd className="mt-1 font-medium text-gray-900">{evidence.notice?.source_id}</dd></div>
        <div><dt className="text-xs text-gray-500">Source result</dt><dd className="mt-1 font-medium text-gray-900">{evidence.sourceResult?.result_status ?? "missing"}</dd></div>
        <div><dt className="text-xs text-gray-500">Body quality</dt><dd className="mt-1 font-medium text-gray-900">{evidence.revision?.body_quality_status ?? "missing"}</dd></div>
        <div><dt className="text-xs text-gray-500">Effective decision</dt><dd className="mt-1 font-medium text-gray-900">{evidence.effectiveDecision?.decision ?? "unreviewed"}</dd></div>
        <div><dt className="text-xs text-gray-500">Last observed</dt><dd className="mt-1 text-gray-800">{evidence.occurrence?.observed_at ?? "missing"}</dd></div>
        <div><dt className="text-xs text-gray-500">Retry count</dt><dd className="mt-1 text-gray-800">{evidence.sourceResult?.retry_count ?? 0}</dd></div>
        <div><dt className="text-xs text-gray-500">Assets</dt><dd className="mt-1 text-gray-800">{evidence.assets.length} metadata records</dd></div>
        <div><dt className="text-xs text-gray-500">Numeric route</dt><dd className="mt-1 text-gray-800">{evidence.preview.numericRouteCompatibility}</dd></div>
      </dl>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Provenance and URLs</h3>
          <dl className="mt-2 space-y-2 text-xs text-gray-700">
            <div><dt className="font-medium text-gray-500">Original</dt><dd className="mt-0.5 break-all">{evidence.occurrence?.original_url ?? "missing"}</dd></div>
            <div><dt className="font-medium text-gray-500">Canonical</dt><dd className="mt-0.5 break-all">{evidence.notice?.canonical_url ?? "missing"}</dd></div>
            <div><dt className="font-medium text-gray-500">Aliases</dt><dd className="mt-0.5">{evidence.aliases.length}</dd></div>
          </dl>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Legacy comparison</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {evidence.legacyComparison.map((item) => (
              <span key={item.field} className={`rounded-md px-2 py-1 text-xs font-medium ${stateClass(item.state)}`}>
                {item.field}: {item.state}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-900">Append-only decision history</h3>
        {evidence.events.length > 0 ? (
          <ol className="mt-2 divide-y divide-gray-100 text-sm">
            {evidence.events.map((event) => (
              <li key={event.id} className="grid gap-1 py-2 sm:grid-cols-[8rem_1fr_auto]">
                <span className="font-medium text-gray-900">{event.decision}</span>
                <span className="text-gray-600">{event.reason ?? "No note"}</span>
                <time className="text-xs text-gray-500">{event.created_at}</time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-gray-600">No review event</p>
        )}
      </div>

      <div className="mt-5 border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-900">Controlled projection preview</h3>
        {evidence.preview.payload ? (
          <pre className="mt-2 max-h-64 overflow-auto bg-gray-950 p-3 text-xs text-gray-100">
            {JSON.stringify(evidence.preview.payload, null, 2)}
          </pre>
        ) : (
          <p className="mt-2 text-sm text-red-700">
            Hidden: {evidence.preview.hiddenReasons.join(", ")}
          </p>
        )}
        <p className="mt-2 text-xs font-medium text-gray-600">publicExposureEnabled=false</p>
      </div>
    </section>
  );
}
