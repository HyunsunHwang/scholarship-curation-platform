import assert from "node:assert/strict";
import {
  applyProjectionDecision,
  decideProjection,
  mapReviewDecisionToPublicState,
  visibleProjectionRows,
} from "../../lib/post-phase-n-q/projection.mjs";

const notice = {
  id: "notice-1",
  source_id: "cau_001",
  canonical_url: "https://example.edu/notices/1",
};
const baseRevision = {
  id: "revision-1",
  title: "2026 장학생 선발 및 장학금 신청 안내",
  body: "등록금 지원 신청 자격과 방법",
  normalized_payload: {
    organization: "중앙대학교",
    apply_start_date: "2026-07-01",
    apply_end_date: "2026-12-31",
  },
};
const approve = {
  decision: "approve",
  decision_event_id: "event-approve",
};
const now = "2026-07-16T00:00:00.000Z";
const today = "2026-07-16";

assert.equal(mapReviewDecisionToPublicState("revoke"), "withdraw");
assert.equal(mapReviewDecisionToPublicState("request_changes"), "needs_review");

let state = new Map();
const create = decideProjection({
  notice,
  revision: baseRevision,
  effectiveDecision: approve,
  today,
  projectedAt: now,
});
assert.equal(create.action, "create");
state = applyProjectionDecision(state, create);
assert.equal(visibleProjectionRows(state, today).length, 1);
const firstId = state.get(notice.id).id;

const replay = decideProjection({
  existingProjection: state.get(notice.id),
  notice,
  revision: baseRevision,
  effectiveDecision: approve,
  today,
  projectedAt: now,
});
state = applyProjectionDecision(state, replay);
assert.equal(state.size, 1);
assert.equal(state.get(notice.id).id, firstId);

const edited = decideProjection({
  existingProjection: state.get(notice.id),
  notice,
  revision: { ...baseRevision, id: "revision-2", title: "수정된 장학금 신청 안내" },
  effectiveDecision: { ...approve, decision_event_id: "event-edit" },
  today,
  projectedAt: "2026-07-17T00:00:00.000Z",
});
state = applyProjectionDecision(state, edited);
assert.equal(state.get(notice.id).name, "수정된 장학금 신청 안내");
assert.equal(state.get(notice.id).id, firstId);

for (const decision of ["reject", "revoke"]) {
  const hidden = decideProjection({
    existingProjection: state.get(notice.id),
    notice,
    revision: baseRevision,
    effectiveDecision: {
      decision,
      decision_event_id: `event-${decision}`,
    },
    today,
    projectedAt: now,
  });
  assert.equal(hidden.action, "hide");
  assert.equal(hidden.public_state, decision === "revoke" ? "withdraw" : "reject");
  assert.equal(visibleProjectionRows(applyProjectionDecision(state, hidden), today).length, 0);
}

const expired = decideProjection({
  existingProjection: state.get(notice.id),
  notice,
  revision: {
    ...baseRevision,
    normalized_payload: {
      ...baseRevision.normalized_payload,
      apply_end_date: "2026-07-15",
    },
  },
  effectiveDecision: approve,
  today,
  projectedAt: now,
});
assert.equal(expired.public_state, "expired");
assert.equal(expired.action, "hide");

const rejectedWithoutProjection = decideProjection({
  notice: { ...notice, id: "notice-2" },
  revision: baseRevision,
  effectiveDecision: {
    decision: "reject",
    decision_event_id: "event-reject-new",
  },
  today,
  projectedAt: now,
});
assert.equal(rejectedWithoutProjection.action, "noop_hidden");

console.log(JSON.stringify({
  passed: true,
  scenarios: [
    "approve_create",
    "idempotent_replay",
    "edit_identity_preserved",
    "reject_hide",
    "withdraw_hide",
    "expire_hide",
    "reject_without_projection",
  ],
  duplicate_projection_count: 0,
  rejected_public_leakage_count: 0,
  withdrawn_public_leakage_count: 0,
}, null, 2));
