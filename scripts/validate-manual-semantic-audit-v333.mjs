import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const audit = JSON.parse(await readFile('reports/llm-analysis/ewha-segment-reference-manual-semantic-audit-v333.json', 'utf8'));
const prior = JSON.parse(await readFile('reports/llm-analysis/ewha-segment-reference-semantic-audit-v332.json', 'utf8'));
const allowed = new Set(['CORRECT', 'PARTIAL', 'UNSUPPORTED', 'HALLUCINATED', 'NOT_EVALUATED']);
const expected = new Map(prior.results.flatMap(({ fixture_id, audited_claims }) => audited_claims.map((claim, claim_index) => [`${fixture_id}:${claim_index}`, claim])));
assert.equal(audit.claims.length, 32, 'exactly 32 claims are required');
assert.equal(audit.provider_calls, 0, 'provider calls must be zero');
assert.equal(audit.db_reads, 0, 'DB reads must be zero');
assert.equal(audit.db_writes, 0, 'DB writes must be zero');
const seen = new Set();
for (const claim of audit.claims) {
  const key = `${claim.fixture_id}:${claim.claim_index}`;
  assert(!seen.has(key), `duplicate claim identity: ${key}`); seen.add(key);
  const original = expected.get(key); assert(original, `unexpected claim identity: ${key}`);
  assert.equal(claim.field, original.field, `${key}: field changed`);
  assert.deepEqual(claim.semantic_value, original.semantic_value, `${key}: semantic value changed`);
  assert.deepEqual(claim.source_refs, original.source_refs, `${key}: source refs changed`);
  assert(allowed.has(claim.assessment), `${key}: invalid assessment`);
  assert(typeof claim.reason === 'string' && claim.reason.trim().length >= 20, `${key}: specific reason required`);
  assert(claim.raw_candidate_match && typeof claim.raw_candidate_match.status === 'string', `${key}: raw candidate match required`);
}
assert.equal(seen.size, expected.size, 'all persisted v3.3.2 claims must be audited');
assert(!JSON.stringify(audit).includes('"COMPLETE"'), 'COMPLETE must not appear');
console.log(`validated ${audit.claims.length} manual claims; provider/db calls: 0/0/0`);
