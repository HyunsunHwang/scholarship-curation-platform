# Phase 4 capture checkpoint contract

The pilot evidence in `phase4-capture-pilot-2026-07-27-run2.json` is preserved unchanged:

- capture success: 8
- transport failure: 1
- historical control unavailable: 8
- same-HTML comparison input: 0
- structural clusters: 0

That evidence predates the artifact-first checkpoint contract. Its capture and transport observations remain valid, but its checkpoint representation must not be interpreted as proof that an artifact was committed before a Source was marked resumable.

Subsequent Phase 4 runs use `phase4-capture-contract-v2`. A Source is resume-skippable only after its create-only artifact has been written, re-read, hashed, schema/source/provenance-validated, and recorded in the Phase 4 checkpoint journal. Historical-control absence remains a successful transport capture with `insufficient_evidence`; it is neither a comparison-ready success nor a capture failure.

## Artifact validation and publication

`validatePhase4CaptureArtifact()` is the shared fail-closed validator for pre-commit, post-write readback, `verify()`, `recover()`, and resume decisions. Terminal artifact capture statuses are `capture_success`, `blocked_external`, `transport_failure`, and `invalid_content`; `insufficient_evidence` is an evidence status only.

The validator enforces the permitted status/evidence/queue combinations, canonical contract fingerprint, exact journal metadata agreement, and capture provenance. A `capture_success` artifact can be either comparison-ready or historical-control-unavailable; those are separate states.

Artifacts are published create-only: a synced temporary file is exclusively hard-linked to the final path, so a concurrent or pre-existing final artifact fails rather than being overwritten. Commit and recovery are deliberately separate paths. Existing pilot evidence remains unchanged, and historical-control reconstruction or actual comparison has not started.
