# Post-Phase L Replay, Reconciliation, and Rollback

## Replay contract

Run identity is derived from a caller-supplied idempotency key. Notice, occurrence, revision, alias, asset, and review-item IDs are deterministic. Reapplying the same plan uses database uniqueness constraints and produces no duplicate canonical notice, occurrence, alias, revision, asset, or compatibility row.

The local fixture is applied twice to an in-memory store before the owner gate. The second application must insert zero rows in every planned table. A changed body keeps notice identity and creates a new content-hash revision. A zero-match run creates only source-result evidence and performs no deletion.

Remote replay after approval compares before/after row sets and fingerprints. An upsert attempt is not counted as an insert without readback evidence.

Revision ordinal allocation is a database responsibility. A `before insert` trigger locks the canonical notice row and assigns `max(revision_ordinal) + 1`; callers cannot create an ordinal collision when changed content arrives concurrently.

Replay updates preserve canonical `first_seen_at`, `created_at`, and the legacy row link. They also preserve the current review state unless the append-event RPC explicitly enters a review transition. A prior approval is never reused for changed content: preview eligibility requires the effective event revision to equal the current revision.

## Reconciliation contract

Reconciliation compares:

- graph notice to `crawled_notices`
- effective review decision to legacy status
- graph assets to legacy `image_urls`
- canonical URL and aliases to legacy `notice_url`
- graph source ID to legacy source text
- controlled preview to a scholarship-compatible payload
- numeric route allocation and conflict state

Every mismatch has an explicit reason. Missing graph, missing legacy, source mismatch, URL mismatch, body mismatch, asset mismatch, and decision/status mismatch are not silently overwritten.

Required metrics include graph/legacy/matched/mismatch/unresolved counts, duplicate risk, preview count, public leakage, and numeric-route conflicts.

`scripts/verify-post-phase-l-runtime.mjs` computes these values from the approved L run and never treats a client-side attempted row count as persistence evidence.

## Bounded data rollback

`post_phase_l_rollback_run(run_id, confirmation)` is restricted to the dedicated L environment and requires the exact rollback confirmation. It selects notices observed only in that run, removes linked compatibility rows only when they remain `new` and have no scholarship link, removes L graph/review evidence in dependency order, and leaves unrelated baseline tables unchanged.

An approved promoted scholarship is outside automatic data rollback and requires an explicit recovery decision. The function therefore fails closed instead of deleting promoted product data.

## Schema rollback

The schema rollback file removes only L graph/review objects after validating the L environment and a session confirmation. It preserves profiles, sources, legacy review, scholarships, other compatibility baseline objects, and the immutable environment guard plus its assertion function. It is not part of the apply sequence.

## Reapply and recovery

After bounded rollback, the same migration fingerprint must remain present. The original deterministic pilot input is reapplied, then replayed once more. Success requires matching run/notice/revision fingerprints, zero duplicate counts, no unrelated table changes, and no public leakage.

Before the owner gate these runtime fields remain false. They may become true only from L project evidence after approved apply.
