# Phase 2 parser remediation plan

## Stage 0 — completed by this commit

Freeze the historical 87-source target set, generate a current baseline from the 545-source post-merge runtime report, and document the existing analyzer/report boundary defects. No crawler, parser, manifest, profile, or source URL behavior changes occur in this stage.

## Stage 1 — completed

Phase-2 status interpretation and evidence invariants now belong to the operational analyzer. The report generator supplies paired evidence but no longer assigns Source-ID-based final states or defaults candidate recall to verified. The existing crawler observation contract remains unchanged.

## Stage 2 — after Stage 1

Add deterministic same-HTML control/treatment candidate comparison evidence, then pass that evidence to the analyzer rather than creating another final-status system.

## Later stages

Cluster unresolved Sources by DOM and URL-identity structure, then apply fixture-first selector, profile, URL, or adapter remediations only where evidence supports it.
