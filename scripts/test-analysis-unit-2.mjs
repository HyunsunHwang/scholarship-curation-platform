import assert from "node:assert/strict";
import fs from "node:fs";
import {
  approveProgramCycleProposal,
  buildProgramCycleProposal,
  findExistingProgramCandidates,
  normalizeProgramName,
  projectCycleToScholarship,
} from "../lib/analysis/program-cycle-domain.mjs";
import {
  validateSemanticReviewDecision,
} from "../lib/analysis/semantic-review.mjs";

const fixture = JSON.parse(fs.readFileSync(
  "fixtures/analysis-unit-1/eligible-analysis.json",
  "utf8",
));
const output = structuredClone(fixture.provider_response);
output.application.url_or_path = fixture.notice.canonical_url;
const result = {
  id: "aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa",
  notice_id: fixture.notice.id,
  revision_id: fixture.revision.id,
  result_status: "validated",
  structured_result: fixture.provider_response,
  result_fingerprint: "a".repeat(64),
};
const review = {
  id: "bbbbbbbb-bbbb-5bbb-8bbb-bbbbbbbbbbbb",
  result_id: result.id,
  notice_id: result.notice_id,
  revision_id: result.revision_id,
  decision: "approve",
  effective_output: output,
};
const evidence = output.evidence.map((entry, index) => ({
  id: `evidence-${index}`,
  result_id: result.id,
  field_path: entry.field_path,
  evidence_fingerprint: String(index).padStart(64, "0"),
}));

// 1. Corrected output validation.
assert.equal(validateSemanticReviewDecision({
  decision: "approve",
  correctedOutput: output,
}).valid, true);
assert.equal(validateSemanticReviewDecision({
  decision: "approve",
  correctedOutput: { lineage: output.lineage },
}).valid, false);
assert.equal(validateSemanticReviewDecision({
  decision: "reject",
  correctedOutput: null,
}).valid, true);

// 2/3/4. Deterministic, eligible, separated Program/Cycle proposal.
const proposalNow = "2026-07-28T10:00:00.000Z";
const first = buildProgramCycleProposal({
  review, result, evidence, notice: fixture.notice, source: fixture.source, now: proposalNow,
});
const second = buildProgramCycleProposal({
  review, result, evidence, notice: fixture.notice, source: fixture.source, now: proposalNow,
});
assert.equal(first.eligible, true);
assert.deepEqual(second, first);
assert.equal(first.proposal.proposed_program.canonical_name, "미래인재 장학금");
assert.equal(first.proposal.proposed_cycle.cycle_year, 2026);
assert.equal(first.proposal.proposed_cycle.application_end_at, "2026-08-15");
assert.equal(first.proposal.proposed_cycle.source_detail_url, fixture.notice.canonical_url);
assert.equal(first.proposal.proposed_cycle.benefits[0].amount_text, "등록금 200만원");
assert.deepEqual(first.proposal.proposed_cycle.eligibility, [
  "미래대학교 재학생",
  "직전 학기 성적 3.0 이상",
]);
for (const invalidReview of [
  { ...review, decision: "needs_revision" },
  { ...review, decision: "reject" },
  { ...review, decision: "reanalysis_requested" },
  { ...review, effective_output: { lineage: output.lineage } },
  { ...review, revision_id: "wrong-revision" },
]) {
  assert.equal(buildProgramCycleProposal({
    review: invalidReview,
    result,
    evidence,
  }).eligible, false);
}
const missingCycle = structuredClone(review);
missingCycle.effective_output.cycle.name = null;
assert.equal(buildProgramCycleProposal({ review: missingCycle, result }).eligible, false);

// 5. Conservative Program matching.
const existingProgram = {
  id: "cccccccc-cccc-5ccc-8ccc-cccccccccccc",
  canonical_name: "미래인재 장학금",
  operating_organization: "미래대학교",
};
const otherOrganization = {
  id: "dddddddd-dddd-5ddd-8ddd-dddddddddddd",
  canonical_name: "미래인재 장학금",
  operating_organization: "다른 재단",
};
const match = findExistingProgramCandidates({
  programName: "미래 인재 장학금",
  operatingOrganization: "미래대학교",
  programs: [existingProgram, otherOrganization],
  aliases: [{
    program_id: existingProgram.id,
    normalized_alias: normalizeProgramName("미래 인재 장학금"),
  }],
});
assert.equal(match.suggested_program_id, existingProgram.id);
assert.deepEqual(match.review_candidates.map((row) => row.program_id), [otherOrganization.id]);

// 6. Atomic approval and idempotency.
const proposal = first.proposal;
let state = {
  programs: [],
  aliases: [],
  cycles: [],
  proposals: [proposal],
  review_events: [],
  scholarships: [],
  projection_links: [],
};
assert.equal(approveProgramCycleProposal({
  state,
  proposalId: proposal.id,
  decision: "approve_new_program_and_cycle",
  actorId: "admin-1",
  idempotencyKey: "approval-1",
  isAdmin: false,
}).reason, "admin_required");
const approved = approveProgramCycleProposal({
  state,
  proposalId: proposal.id,
  decision: "approve_new_program_and_cycle",
  actorId: "admin-1",
  idempotencyKey: "approval-1",
  isAdmin: true,
});
assert.equal(approved.ok, true);
assert.equal(approved.state.programs.length, 1);
assert.equal(approved.state.cycles.length, 1);
const replayed = approveProgramCycleProposal({
  state: approved.state,
  proposalId: proposal.id,
  decision: "approve_new_program_and_cycle",
  actorId: "admin-1",
  idempotencyKey: "approval-1",
  isAdmin: true,
});
assert.equal(replayed.replayed, true);
assert.equal(replayed.state.programs.length, 1);
assert.equal(replayed.state.cycles.length, 1);

const newReview = { ...review, id: "eeeeeeee-eeee-5eee-8eee-eeeeeeeeeeee" };
const newResult = {
  ...result,
  id: "ffffffff-ffff-5fff-8fff-ffffffffffff",
  revision_id: "99999999-9999-5999-8999-999999999999",
};
newReview.result_id = newResult.id;
newReview.revision_id = newResult.revision_id;
newReview.effective_output = structuredClone(output);
newReview.effective_output.lineage.revision_id = newResult.revision_id;
newReview.effective_output.cycle.name = "2027학년도";
const existingProgramProposal = buildProgramCycleProposal({
  review: newReview,
  result: newResult,
  programs: approved.state.programs,
  aliases: approved.state.aliases,
}).proposal;
state = {
  ...approved.state,
  proposals: [...approved.state.proposals, existingProgramProposal],
};
const existingApproved = approveProgramCycleProposal({
  state,
  proposalId: existingProgramProposal.id,
  decision: "approve_existing_program_new_cycle",
  existingProgramId: approved.program.id,
  actorId: "admin-1",
  idempotencyKey: "approval-2",
  isAdmin: true,
});
assert.equal(existingApproved.ok, true);
assert.equal(existingApproved.state.programs.length, 1);
assert.equal(existingApproved.state.cycles.length, 2);

// 7. Projection is explicit, approved-only, idempotent, hidden, and collision-safe.
assert.equal(projectCycleToScholarship({
  state: approved.state,
  cycleId: approved.cycle.id,
  allowProjection: false,
}).reason, "explicit_projection_required");
const projected = projectCycleToScholarship({
  state: approved.state,
  cycleId: approved.cycle.id,
  allowProjection: true,
});
assert.equal(projected.ok, true);
assert.equal(projected.scholarship.is_verified, false);
assert.equal(projected.scholarship.list_on_home, false);
assert.equal(projected.link.cycle_id, approved.cycle.id);
const projectionReplay = projectCycleToScholarship({
  state: projected.state,
  cycleId: approved.cycle.id,
  allowProjection: true,
});
assert.equal(projectionReplay.replayed, true);
assert.equal(projectionReplay.state.scholarships.length, 1);
const unapprovedState = structuredClone(approved.state);
unapprovedState.cycles[0].canonical_status = "draft";
assert.equal(projectCycleToScholarship({
  state: unapprovedState,
  cycleId: approved.cycle.id,
  allowProjection: true,
}).reason, "approved_cycle_required");
const collisionState = structuredClone(approved.state);
collisionState.scholarships.push({
  id: 42,
  name: approved.program.canonical_name,
  apply_url: approved.cycle.application_url,
  source_kind: "manual",
});
assert.equal(projectCycleToScholarship({
  state: collisionState,
  cycleId: approved.cycle.id,
  allowProjection: true,
}).reason, "manual_scholarship_collision");

// SQL safety is a supplement to the executable domain contracts above.
const migration = fs.readFileSync(
  "supabase/post-phase-l/006_program_cycle_canonical_and_projection.sql",
  "utf8",
);
assert.match(migration, /perform public\.post_phase_l_assert_environment\(\)/);
assert.match(migration, /for update/);
assert.match(migration, /manual_scholarship_collision/);
assert.match(migration, /is_verified, list_on_home[\s\S]+false, false/);
assert.match(migration, /scholarship proposal immutable fields cannot change/);
assert.match(migration, /program_name_and_cycle_label_required/);
assert.match(migration, /revoke all on function public\.approve_scholarship_program_cycle_proposal/);

console.log("PASS analysis unit 2 contracts");
