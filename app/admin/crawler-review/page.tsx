import Link from "next/link";
import {
  filterAdminCrawlerReviewDiagnostics,
  getAdminCrawlerReviewDiagnostics,
  parseAdminCrawlerReviewFilter,
  type AdminCrawlerReviewFilter,
} from "@/lib/admin/crawler-review-diagnostics";
import { getLlmReviewAssistanceReport } from "@/lib/admin/llm-review-assistance";

const FILTERS: Array<{ key: AdminCrawlerReviewFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "clean", label: "Clean" },
  { key: "needs-review", label: "Needs review" },
  { key: "blocked", label: "Blocked" },
  { key: "zero-match", label: "Zero match" },
  { key: "parser-readability", label: "Parser/readability" },
  { key: "p0-p1", label: "P0/P1" },
];

function statusClass(value: string) {
  if (value === "blocked") return "bg-red-100 text-red-700";
  if (value === "clean" || value === "resolved") return "bg-emerald-100 text-emerald-700";
  if (value.includes("review") || value.includes("ambiguous")) return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-700";
}

function buildHref(filter: AdminCrawlerReviewFilter) {
  return filter === "all" ? "/admin/crawler-review" : `/admin/crawler-review?filter=${filter}`;
}

export default async function AdminCrawlerReviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string }>;
}) {
  const filter = parseAdminCrawlerReviewFilter((await searchParams)?.filter);
  const report = getAdminCrawlerReviewDiagnostics();
  const llmAssistance = getLlmReviewAssistanceReport();
  const diagnostics = filterAdminCrawlerReviewDiagnostics(report.diagnostics, filter);
  const cards = [
    ["Total diagnostics", report.metrics.diagnostic_item_count],
    ["Clean", report.metrics.clean_count],
    ["Admin review", report.metrics.admin_review_required_count],
    ["Blocked", report.metrics.blocked_count],
    ["Zero match", report.metrics.zero_match_observed_count],
    ["Parser/readability", report.metrics.parser_readability_issue_count],
    ["P0/P1 remediation", report.metrics.p0_remediation_count + report.metrics.p1_remediation_count],
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Crawler operations</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Crawler review diagnostics</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Adapter-backed, repository report diagnostics for review context. This route is read-only.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Diagnostic summary">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Read-only scope</p>
        <ul className="mt-2 space-y-1 text-amber-800">
          {report.scope_notices.map((notice) => <li key={notice}>{notice}</li>)}
        </ul>
      </section>

      <section className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
        <p className="font-semibold">AI review assistance prototype</p>
        <p className="mt-1">AI suggestions are evidence-linked review assistance only. Human judgment is required; approval, rejection, persistence, and public exposure are disabled.</p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          <div><dt className="text-xs font-medium text-violet-700">Mode</dt><dd>{llmAssistance.execution_mode}</dd></div>
          <div><dt className="text-xs font-medium text-violet-700">Evaluation cases</dt><dd>{llmAssistance.metrics.evaluation_case_count}</dd></div>
          <div><dt className="text-xs font-medium text-violet-700">Public exposure change</dt><dd>{llmAssistance.metrics.public_exposure_change_count}</dd></div>
        </dl>
      </section>

      <section>
        <div className="flex flex-wrap gap-2" aria-label="Diagnostic filters">
          {FILTERS.map((item) => {
            const active = item.key === filter;
            return (
              <Link
                key={item.key}
                href={buildHref(item.key)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${active ? "border-brand bg-brand text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Diagnostics ({diagnostics.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1000px] divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Resolution</th>
                <th className="px-4 py-3">Review</th>
                <th className="px-4 py-3">Quality/readability</th>
                <th className="px-4 py-3">Coverage/parser</th>
                <th className="px-4 py-3">Next action</th>
                <th className="px-4 py-3">Batch / rollback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {diagnostics.map((item) => (
                <tr key={item.id} className="align-top hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{item.sourceKey || "Missing source key"}</p>
                    <p className="mt-1 text-xs text-gray-500">{item.sourceId ?? "No source_id"}</p>
                    <p className="mt-1 max-w-56 text-xs text-gray-500">{item.title}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusClass(item.sourceResolutionStatus)}`}>{item.sourceResolutionStatus}</span>
                    <p className="mt-2 max-w-44 text-xs text-gray-500">{item.sourceResolutionReason}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusClass(item.reviewStatus)}`}>{item.reviewStatus}</span>
                    <p className="mt-2 text-xs text-gray-500">{item.adminReviewRequired ? "Admin review required" : "No review action required"}</p>
                    <p className="mt-1 text-xs text-gray-500">Auto apply eligibility: {item.autoApplyAllowed ? "allowed later" : "not allowed"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-gray-800">{item.qualityStatus}</p>
                    <p className="mt-1 max-w-48 text-xs text-gray-500">{item.qualityFlags.join(", ") || "No flagged quality state"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-52 text-xs text-gray-700">{item.parserFailureReasonCodes.join(", ") || "No parser/readability code"}</p>
                    {item.zeroMatchObserved ? <p className="mt-2 text-xs font-semibold text-red-700">Zero match observed</p> : null}
                    {item.falseNegativeReview ? <p className="mt-1 text-xs font-semibold text-amber-700">False-negative review</p> : null}
                    {item.remediationPriority ? <p className="mt-1 text-xs font-semibold text-amber-700">{item.remediationPriority} remediation</p> : null}
                    {item.f2RemediationStatus ? <p className="mt-1 text-xs font-semibold text-gray-700">F-2: {item.f2RemediationStatus} ({item.f2ClassificationBefore} to {item.f2ClassificationAfter})</p> : null}
                    {item.f3RemediationStatus ? <p className="mt-1 text-xs font-semibold text-gray-700">F-3: {item.f3RemediationStatus} ({item.f3ClassificationBefore} to {item.f3ClassificationAfter})</p> : null}
                    {item.f3RiskCodes.length > 0 ? <p className="mt-1 max-w-52 text-xs text-amber-700">F-3 risk: {item.f3RiskCodes.join(", ")}</p> : null}
                  </td>
                  <td className="px-4 py-3"><p className="max-w-56 text-xs text-gray-700">{item.nextAction}</p>{item.f2NextAction && item.f2NextAction !== item.nextAction ? <p className="mt-1 max-w-56 text-xs text-gray-500">F-2: {item.f2NextAction}</p> : null}{item.f3NextAction && item.f3NextAction !== item.nextAction ? <p className="mt-1 max-w-56 text-xs text-gray-500">F-3: {item.f3NextAction}</p> : null}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-gray-700">{item.batchStatus} / {item.sourceResultStatus}</p>
                    <p className="mt-1 text-xs text-gray-500">{item.batchWarning ?? "No batch warning"}</p>
                    <p className="mt-1 text-xs text-gray-500">Rollback scope: {item.rollbackScopeAvailable ? "available" : "not available"}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Quality/readability policy</h2>
          <div className="mt-3 space-y-2">
            {report.quality_readability_policy.map((item) => <div key={item.case} className="rounded-md bg-gray-50 px-3 py-2 text-sm"><p className="font-medium text-gray-900">{item.case} - {item.disposition}</p><p className="mt-1 text-xs text-gray-600">{item.policy}</p></div>)}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Batch and remediation context</h2>
          <dl className="mt-3 space-y-3 text-sm text-gray-700">
            <div><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Batch status</dt><dd className="mt-1">{report.batch_summary.batch_status}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Batch warnings</dt><dd className="mt-1">{report.batch_summary.batch_warning_count}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Rollback scopes</dt><dd className="mt-1">{report.batch_summary.rollback_scope_available_count}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">B/C no-assets evidence</dt><dd className="mt-1">Text sufficient: {report.review_quality_summary.no_assets_text_sufficient_count} / Needs review: {report.review_quality_summary.no_assets_needs_review_count}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">B/C image-only suspected</dt><dd className="mt-1">{report.review_quality_summary.image_only_suspected_count}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">A Foundation</dt><dd className="mt-1">Coverage/parser/remediation policy only; remediation implementation remains a follow-up.</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">F-2 bounded P0</dt><dd className="mt-1">Resolved: {report.f2_summary.p0_resolved_count} / Deferred: {report.f2_summary.p0_deferred_count} / Review retained: {report.f2_summary.manual_review_retained_count}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">F-3 bounded P1</dt><dd className="mt-1">Resolved: {report.f3_summary.p1_resolved_count} / Deferred: {report.f3_summary.p1_deferred_count} / Attachment metadata: {report.f3_summary.attachment_metadata_present_count} / Encoding cases: {report.f3_summary.encoding_case_count}</dd></div>
          </dl>
        </div>
      </section>
    </div>
  );
}
