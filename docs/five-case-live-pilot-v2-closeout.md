# Five-Case Live Pilot v2 Closeout

## Decision

`five-case-live-pilot-v2` is a closed failed experiment. Its durable pilot run is
`d6d3c430-3087-46b4-8254-67d7f811778e` and its manifest fingerprint is
`458d377b9e1d313669897211a7a01f5f4a9c94416af58620ea3b3c39dcfc9ca9`.

| Checkpoint | Classification |
| --- | --- |
| Migration 009 | PASS |
| Migration 010 | PASS |
| Pilot registration | PASS |
| Preflight | PASS |
| Smoke execution | FAIL |
| Expansion | CANCELLED WITHOUT EXECUTION |
| Production readiness | NOT EVALUATED |
| LLM analysis quality | NOT EVALUATED |
| Provider connectivity | NOT ESTABLISHED |
| Existing failure evidence | PRESERVED |
| Retry/reset/re-registration | PROHIBITED |
| Live provider execution | DISABLED |
| Control-plane remediation | DEFERRED |

The failure is limited to this pilot execution method and its provider/control-plane
path. It is not evidence that LLM-assisted interpretation of scholarship notices is
unsound, nor is it a production-readiness or LLM-quality failure.

## Preserved evidence

The smoke member was `31292cbb-0498-5db6-bc7a-13165d3d0820`. Its recorded outcome is:

- one member claimed;
- one economy provider-call attempt using `claude-haiku-4-5-20251001`;
- one escalation provider-call attempt using `claude-sonnet-4-6`;
- both runs `terminal_failed` with `validation_status=not_validated` and
  `error_code=provider_transport_error`;
- token usage `null`, zero provider-usage receipts, and zero routing decisions;
- analysis job `retryable_failed`, `attempt_count=1`, and lease released.

The worker emitted `usage_status=unreconciled` with two missing usage runs, while the
pilot row remains `status=failed`, `usage_status=not_started`, and
`actual_cost_micros=null`. This disagreement is a preserved known issue; it must not be
reconciled, reset, or otherwise rewritten as part of this closeout.

The four expansion members were never executed:

- `2e5f7bbf-f854-53d0-93db-955f30443926`
- `be3f5cc6-34f0-5cb4-be19-05b861c4acff`
- `76d9a116-786d-5e8b-bb10-8622e99b2032`
- `cffe0fc5-6ce3-5e5f-84e9-20b8f8c6bb16`

Each remains `pending` with `attempt_count=0`, no lease, and `member_status=ready`.
No production access occurred, raw provider responses were not stored, and no existing
analysis-job rows were arbitrarily changed.

## Lessons retained

- The experiment failed before LLM analysis quality could be assessed: provider execution
  and the pilot control plane were the failing surface.
- Routing, escalation, usage receipts, reconciliation, claims, leases, and pilot
  aggregation were too tightly coupled for a five-case value test.
- Live provider execution is not a debugging loop and must remain disabled.
- The existing pilot control plane is frozen. Repairing or completing it is not a
  prerequisite for future LLM work.
- Do not expand usage reconciliation, automatic escalation, batch orchestration, or
  operational cost accounting until a product need explicitly justifies them.

## Minimum policy for future LLM ingestion and analysis

Future work must verify only the following critical risks before proceeding:

- sandbox and production databases are distinct, and the production ref is never accessed;
- live providers are disabled by default and cannot be called without explicit approval;
- database writes require an explicit guard;
- identical input cannot retry indefinitely or incur unbounded cost; call or cost caps exist;
- schema-invalid LLM output cannot become normal data;
- unverified analysis cannot automatically reach user-visible data;
- one failure cannot corrupt the queue or existing valid data; and
- failure evidence cannot be lost through reset or cleanup.

The following are explicitly not required at this stage: multi-model routing, automatic
economy-to-escalation switching, complete provider-usage reconciliation, precise pilot
aggregate status, large-scale claim/lease orchestration, operational cost accounting,
automatic recovery for every provider error, expansion batches, or a production-readiness
decision. Introduce them only in a separately approved phase when a concrete product need
exists.

## Verification note

On 2026-07-29, the existing read-only
`scripts/verify-analysis-live-pilot-v2.mjs` was inspected: it uses only `select` queries
and has no provider, RPC, or mutation path. It was run with the approved sandbox
environment and the closed pilot ID, but stopped at the namespace job query with
`pilot_v2_verify_failed` and no database error code. Consequently this closeout relies on
the preserved operator evidence above and does not claim a fresh runtime re-verification.
No database write, provider call, or production access was performed during the attempt.
