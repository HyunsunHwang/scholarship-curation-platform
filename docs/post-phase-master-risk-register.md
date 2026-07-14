# Post-Phase Master Risk Register

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
| Main ESLint baseline | Deferred, non-blocking | J | Remediate or explicitly baseline the seven existing errors and five warnings. |

No unresolved risk may move forward without a named future resolution phase and measurable success criteria.
