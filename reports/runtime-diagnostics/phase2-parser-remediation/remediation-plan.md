# Phase 2 parser remediation plan

## Stage 0 — completed by this commit

Freeze the historical 87-source target set, generate a current baseline from the 545-source post-merge runtime report, and document the existing analyzer/report boundary defects. No crawler, parser, manifest, profile, or source URL behavior changes occur in this stage.

## Stage 1 — completed

Phase-2 status interpretation and evidence invariants now belong to the operational analyzer. The report generator supplies paired evidence but no longer assigns Source-ID-based final states or defaults candidate recall to verified. The existing crawler observation contract remains unchanged.

## Stage 2 — completed

Deterministic same-HTML control/treatment candidate comparison evidence now requires identical HTML SHA-256 values and produces fail-closed candidate arithmetic. The analyzer consumes the resulting evidence directly; no second final-status system is introduced.

## Stage 3 — clustering in progress

Cluster unresolved Sources by audited same-HTML DOM and URL-identity structure. A Source without same-capture evidence is explicitly queued for capture; it is never promoted to a safe parser cluster. Only a later fixture-first remediation stage may apply selectors, profiles, URLs, or adapters.
