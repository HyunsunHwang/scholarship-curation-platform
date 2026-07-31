import assert from "node:assert/strict";
import fs from "node:fs";

const out = "reports/university-beta";
const json = (name) => JSON.parse(fs.readFileSync(`${out}/${name}`, "utf8"));
const hard = json("hard-non-success-29-baseline.json"); const partial = json("partial-degraded-2-baseline.json"); const watch = json("with-items-to-zero-9-baseline.json");
const diagnostics = json("non-success-29-partial-2-watchlist-9-diagnostics.json"); const analysis = json("with-items-to-zero-9-analysis.json"); const strategy = json("non-success-29-partial-2-solution-strategy.json");
assert.equal(hard.count, 29); assert.equal(partial.count, 2); assert.equal(watch.count, 9); assert.equal(diagnostics.count, 40); assert.equal(analysis.count, 9); assert.equal(strategy.count, 31);
const hardIds = new Set(hard.sources.map((row) => row.source_id)); const partialIds = new Set(partial.sources.map((row) => row.source_id)); const watchIds = new Set(watch.sources.map((row) => row.source_id));
assert.equal(hardIds.size, 29); assert.equal(partialIds.size, 2); assert.equal(watchIds.size, 9); assert.equal([...partialIds].filter((id) => hardIds.has(id)).length, 0); assert.equal([...watchIds].filter((id) => hardIds.has(id) || partialIds.has(id)).length, 0); assert.equal(new Set([...hardIds, ...partialIds, ...watchIds]).size, 40);
assert.ok([...hard.sources, ...partial.sources, ...watch.sources].every((row) => row.source_id !== "ou_1821_univ_001"), "disabled source must be excluded");
assert.ok([...diagnostics.hard_non_success, ...diagnostics.partial_degraded].every((row) => row.human_explanation_ko && row.recommended_action && row.priority && row.effort));
assert.ok(analysis.sources.every((row) => row.zero_reason));
assert.ok(fs.existsSync(`${out}/non-success-29-partial-2-watchlist-9-human-review.html`));
const html = fs.readFileSync(`${out}/non-success-29-partial-2-watchlist-9-human-review.html`, "utf8");
assert.match(html, /Hard non-success: 현재 수집 실패/); assert.match(html, /Partial\/degraded: 일부 수집 성공, 완전성 미달/); assert.match(html, /Coverage watchlist: 실행 성공, 기존보다 관측량 감소/);
for (const id of [...hardIds, ...partialIds, ...watchIds]) assert.ok(fs.existsSync(`${out}/non-success-29-watchlist-9-evidence/${id}/response-summary.json`), `missing evidence for ${id}`);
console.log("non-success-29-partial-2-watchlist-9 artifacts passed");
