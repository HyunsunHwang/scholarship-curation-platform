import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { planProviderCalls } from '../lib/analysis/segment-reference-pipeline-v34.mjs';

const fixture = JSON.parse(readFileSync('fixtures/llm-analysis/unseen-generalization-v343.json', 'utf8'));
assert.equal(fixture.records.length, 2);
assert.deepEqual(planProviderCalls(fixture.records).plan.map((x) => x.tier), ['SIMPLE', 'COMPLEX']);
assert.equal(planProviderCalls(fixture.records).total_calls, 3);
for (const record of fixture.records) {
  assert.match(record.original_url, /^https:\/\//u);
  assert.ok(record.source_id && record.article_id && record.published_at);
  assert.ok(record.body_text.length >= 1000);
  assert.equal(createHash('sha256').update(record.body_text).digest('hex'), record.body_sha256);
}
assert.match(fixture.records[0].body_text, /평점평균 4\.0 미만/u);
assert.match(fixture.records[0].body_text, /수업료 100%/u);
assert.match(fixture.records[1].body_text, /최대 300만원/u);
assert.match(fixture.records[1].body_text, /신청기간/u);
assert.ok(existsSync('reports/llm-analysis/segment-reference-generalization-v343.json'));
const report = JSON.parse(readFileSync('reports/llm-analysis/segment-reference-generalization-v343.json', 'utf8'));
assert.equal(report.provider_call_count, 3);
assert.equal(report.provider_attempt_count, 3);
assert.equal(report.retry_count, 0);
assert.equal(report.fallback_count, 0);
assert.equal(report.four_fixture_benchmark.fixture_count, 4);
assert.equal(report.results.length, 2);
assert.deepEqual(report.results.map((x) => x.complexity.tier), ['SIMPLE', 'COMPLEX']);
assert.ok(report.results.every((x) => Array.isArray(x.raw_validation)));
assert.ok(report.results.every((x) => x.offline_replay.provider_call_count === 0));
assert.ok(report.semantic_audit.new_claims.length > 0);
console.log('v3.4.3 four-fixture generalization tests passed');
