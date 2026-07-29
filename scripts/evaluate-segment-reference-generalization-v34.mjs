import { globSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { callAnthropic } from '../lib/analysis/anthropic-provider.mjs';
import { classifyComplexity, planProviderCalls, runSegmentReferencePipelineV34, V34_PROVIDER_POLICY } from '../lib/analysis/segment-reference-pipeline-v34.mjs';

const output = 'reports/llm-analysis/segment-reference-generalization-v34.json';
const live = process.argv.includes('--live');
if (existsSync(output)) throw new Error('refusing_to_overwrite_existing_report');
if (live && process.env.SEGMENT_REFERENCE_V34_ALLOW_PROVIDER !== 'true') throw new Error('provider_permission_missing');
const noticeFiles = globSync('reports/**/crawler/scholarship-notices-*.json').sort();
const candidates = new Map();
for (const reportPath of noticeFiles) {
  const artifact = JSON.parse(readFileSync(reportPath, 'utf8'));
  for (const item of [...(artifact.newNotices ?? []), ...(artifact.observedItems ?? [])]) {
    const body = item.content ?? item.contentExcerpt ?? '';
    const title = item.title ?? '';
    if (body.length < 250 || !/(장학|학자금|scholarship)/iu.test(body)) continue;
    if (!/(장학|학자금|scholarship)/iu.test(title)) continue;
    const identity = item.noticeUrl ?? `${item.sourceId}:${title}`;
    if (!candidates.has(identity)) candidates.set(identity, { fixture_id: `persisted-${createHash('sha256').update(identity).digest('hex').slice(0, 12)}`, source_id: item.sourceId, article_id: createHash('sha256').update(identity).digest('hex').slice(0, 16), title, body_text: body, selection_provenance: { report_path: reportPath, notice_url: item.noticeUrl ?? null, source_record_kind: item.content ? 'newNotice' : 'observedItem_excerpt' } });
  }
}
const selected = [...candidates.values()].sort((left, right) => right.body_text.length - left.body_text.length).slice(0, 4);
const provider_plan = planProviderCalls(selected);
const report = { evaluation: 'segment-reference-generalization-v3.4', generated_at: new Date().toISOString(), live, model: 'claude-sonnet-4-6', provider_policy: V34_PROVIDER_POLICY, provider_attempt_count: 0, provider_call_count: 0, db_read_count: 0, db_write_count: 0, crawler_run_count: 0, production_access_count: 0, selection: { requested_fixture_count: 4, persisted_candidate_count: candidates.size, selected_fixture_count: selected.length, provider_plan, selected: selected.map((record) => ({ ...record, complexity_preview: classifyComplexity(record.body_text).tier })) }, results: [] };
for (const record of selected) {
  const result = live ? await runSegmentReferencePipelineV34({ record, providerCall: callAnthropic }) : { fixture_id: record.fixture_id, source_id: record.source_id, article_id: record.article_id, title: record.title, parse_status: 'not_run', provider_call_count: 0 };
  report.provider_attempt_count += result.provider_attempt_count ?? 0; report.provider_call_count += result.provider_call_count;
  report.results.push(result);
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}
const completed = report.results.filter((result) => result.parse_status === 'completed').length;
const tierRate = (tier) => { const rows = report.results.filter((result) => result.complexity?.tier === tier); return rows.length ? rows.filter((result) => result.parse_status === 'completed').length / rows.length : null; };
const claims = report.results.map((result) => result.claim_result ?? {});
report.metrics = { fixture_count: selected.length, completed, partial: report.results.filter((result) => result.parse_status === 'partial').length, failed: report.results.filter((result) => result.parse_status === 'failed').length, simple_success_rate: tierRate('SIMPLE'), complex_success_rate: tierRate('COMPLEX'), input_tokens: report.results.reduce((sum, result) => sum + (result.passes ?? []).reduce((inner, pass) => inner + (pass.usage?.input_tokens ?? 0), 0), 0), output_tokens: report.results.reduce((sum, result) => sum + (result.passes ?? []).reduce((inner, pass) => inner + (pass.usage?.output_tokens ?? 0), 0), 0), accepted_claim_ratio: null, manual_review_claim_ratio: null, deterministic_recovery_ratio: null, provider_repair_candidate_ratio: null, semantic_audit: { status: 'NOT_EVALUATED', reason: 'no parsed claims because provider credentials were unavailable' } };
report.decision = selected.length < 4 ? 'HOLD' : completed >= 3 ? 'CONDITIONAL_PASS' : 'HOLD';
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, fixture_count: selected.length, provider_call_count: report.provider_call_count, decision: report.decision }));
