export const REVIEW_TO_PUBLIC_STATE = Object.freeze({
  needs_review: "needs_review",
  reopen: "needs_review",
  request_changes: "needs_review",
  approve: "approve",
  reject: "reject",
  revoke: "withdraw",
  withdraw: "withdraw",
  supersede: "superseded",
  merge_duplicate: "superseded",
});

export function mapReviewDecisionToPublicState(decision) {
  return REVIEW_TO_PUBLIC_STATE[decision] ?? "needs_review";
}

export function isExpiredDate(date, today) {
  if (!date) return false;
  return String(date).slice(0, 10) < String(today).slice(0, 10);
}

function normalizedProjection({
  existingProjection,
  notice,
  revision,
  effectiveDecision,
  projectorVersion,
  projectedAt,
}) {
  const payload = revision.normalized_payload ?? {};
  return {
    id: existingProjection?.id ?? null,
    notice_id: notice.id,
    source_id: notice.source_id,
    effective_review_event_id: effectiveDecision.decision_event_id,
    revision_id: revision.id,
    name: revision.title,
    organization:
      payload.organization ?? existingProjection?.organization ?? notice.source_id,
    apply_start_date:
      payload.apply_start_date ??
      existingProjection?.apply_start_date ??
      projectedAt.slice(0, 10),
    apply_end_date:
      payload.apply_end_date ??
      existingProjection?.apply_end_date ??
      "9999-12-31",
    apply_url: notice.canonical_url,
    homepage_url: notice.canonical_url,
    original_notice_text: revision.body ?? "",
    is_verified: true,
    list_on_home: true,
    projected_at: projectedAt,
    projector_version: projectorVersion,
  };
}

export function decideProjection({
  existingProjection = null,
  notice,
  revision,
  effectiveDecision,
  today,
  projectedAt,
  projectorVersion = "post-phase-o-projector/v1",
}) {
  const publicState = mapReviewDecisionToPublicState(
    effectiveDecision?.decision,
  );
  const projection = normalizedProjection({
    existingProjection,
    notice,
    revision,
    effectiveDecision,
    projectorVersion,
    projectedAt,
  });
  const expired = isExpiredDate(projection.apply_end_date, today);

  if (publicState === "approve" && !expired) {
    return {
      action: existingProjection ? "update_or_show" : "create",
      public_state: "approve",
      projection,
      reason: "effective_approve",
    };
  }

  if (!existingProjection) {
    return {
      action: "noop_hidden",
      public_state: expired ? "expired" : publicState,
      projection: null,
      reason: expired ? "expired_before_projection" : "no_public_projection_allowed",
    };
  }

  return {
    action: "hide",
    public_state: expired ? "expired" : publicState,
    projection: {
      ...existingProjection,
      is_verified: false,
      list_on_home: false,
      projected_at: projectedAt,
      projector_version: projectorVersion,
      effective_review_event_id: effectiveDecision?.decision_event_id ?? null,
    },
    reason: expired ? "expired_projection_hidden" : "effective_state_hidden",
  };
}

export function applyProjectionDecision(state, decision) {
  const next = new Map(state);
  if (decision.action === "noop_hidden") return next;
  const key = decision.projection.notice_id;
  const existing = next.get(key);
  const id = existing?.id ?? decision.projection.id ?? next.size + 1;
  next.set(key, { ...decision.projection, id });
  return next;
}

export function visibleProjectionRows(state, today) {
  return [...state.values()].filter(
    (row) =>
      row.is_verified === true &&
      row.list_on_home === true &&
      !isExpiredDate(row.apply_end_date, today),
  );
}
