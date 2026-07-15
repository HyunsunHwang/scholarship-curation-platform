# Post-Phase Master Risk Register

## Post-Phase K update

K does not reopen Post-Phase J planning. It converts the settled architecture into truthful product boundaries and a fixed L implementation surface. The register adds K evidence for report/prototype overclaim, mutable legacy review, source identity ownership, evidence freshness/public leakage, personal-engine divergence, pilot-cohort limits, and implementation/browser authority. These are mitigated or bounded by K presentation and convergence decisions; their implementation resolution belongs to Post-Phase L or M.

## Post-Phase J update

Post-Phase J supplies direct planning evidence for the canonical graph, append-only review-event, compatibility, rollback, and guarded-apply designs. It does not resolve production implementation risks. The register therefore marks only design coverage as mitigated and keeps target inventory, migration-history divergence, backfill identity, RLS compatibility, and public-projection reconciliation deferred. They block migration implementation readiness, not the next planning phase, so their `blocking_for_next_phase` value remains false. Engine Convergence and external-provider evaluation remain post-J follow-up work.

This register carries unresolved risks forward without treating a read-only MVP as a production ingestion approval.

## Contract And Status Policy

The machine-readable counterpart is `reports/post-phase-master-risk-register.json`.
`id` is the canonical `risk_id`; `status` is `current_status`; and
`why_not_resolved_now` is the canonical `deferral_reason`. Every unresolved
risk also carries explicit `origin_phase`, `evidence`, `owner`,
`blocking_for_next_phase`, future `next_resolution_phase`, `next_work_unit`,
and measurable `success_criteria`.

Only `resolved` is terminal. `open`, `deferred`, `mitigated`, and `accepted`
remain unresolved: mitigation and acceptance constrain current behavior, but
they do not replace future observation or resolution work. A completed phase
such as H or I cannot be the sole future resolution phase for such a risk.

| Risk | Status | Next phase | Success criteria |
| --- | --- | --- | --- |
| cau_003 duplicate evidence | Mitigated | J | Explicit reviewer decision after evidence comparison. |
| cau_012 coverage | Deferred | J | Source identity inventory alignment before bounded coverage evidence. |
| cau_008 incomplete batch | Deferred | Post-Phase J follow-up - Engine Convergence | Source-specific mapping, attachment/parser convergence, and bounded source recheck. |
| Attachment parsing | Deferred | Post-Phase J follow-up - Engine Convergence | Deterministic complex-attachment evidence and bounded source recheck. |
| cau_007 zero match | Deferred | Post-Phase J follow-up - Engine Convergence | Source-specific mapping plus readable-body and encoding verification. |
| Contextual keyword detection | Mitigated | Post-Phase J follow-up - Engine Convergence | Bounded detector corpus recheck. |
| Coverage completeness | Accepted | Post-Phase J follow-up - Engine Convergence | Bounded coverage expansion and observation-window recheck. |
| Bootstrap dependencies | Open | G | Standard environment completes documented build verification. |
| Review persistence | Deferred | J | Approved, auditable review-decision lifecycle. |
| Schema alignment | Deferred | J | Approved compatibility, rollback, and migration plan. |
| Guarded production apply | Deferred | J | Separately approved dry-run, audit, and rollback design. |
| Bootstrap dependencies (`@next/env`, `sharp`, `unrs-resolver`) | Resolved | G | `npm ci`, production build, TypeScript, and changed-file ESLint passed. |
| `public.site_settings` schema cache | Deferred, non-blocking | J | Confirm target schema presence; prepare migration and compatibility plan if needed. |
| Main ESLint baseline | Deferred, non-blocking | Post-Phase L | Remediate or explicitly baseline the eleven existing errors and five warnings; K changed-file ESLint is clean. |
| Report prototype overclaim | Mitigated | Post-Phase L | Controlled projection reaches selected-cohort parity without leakage. |
| Legacy review mutation | Mitigated | Post-Phase L | Immutable decision history works with legacy queue compatibility. |
| Source identity and ownership | Mitigated | Post-Phase L | Exact source resolution and one canonical owner per capability. |
| Evidence freshness and leakage | Mitigated | Post-Phase L | Attributable evidence/run state or an explicit public block. |
| Personal engine port divergence | Mitigated | Post-Phase L | Cohort replay proves compatibility for every ported or merged capability. |
| Pilot cohort overfitting | Accepted | Post-Phase M | Expansion is driven by operating thresholds, not pilot claims. |
| Implementation/browser authority | Deferred | Post-Phase L | Authorized non-production target inventory and reviewer walkthrough. |

No unresolved risk may move forward without a named future resolution phase and measurable success criteria.
