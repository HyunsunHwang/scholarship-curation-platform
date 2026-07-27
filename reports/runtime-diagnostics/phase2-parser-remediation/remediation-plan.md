# Phase 2 parser remediation plan

## Stage 0 — completed by this commit

Freeze the historical 87-source target set, generate a current baseline from the 545-source post-merge runtime report, and document the existing analyzer/report boundary defects. No crawler, parser, manifest, profile, or source URL behavior changes occur in this stage.

## Stage 1 — next

Move phase-2 status interpretation and evidence invariants into the operational analyzer. Remove report-generator defaults that claim candidate recall without diff evidence. Preserve the existing crawler observation contract.

## Stage 2 — after Stage 1

Add deterministic same-HTML control/treatment candidate comparison evidence, then pass that evidence to the analyzer rather than creating another final-status system.

## Later stages

Cluster unresolved Sources by DOM and URL-identity structure, then apply fixture-first selector, profile, URL, or adapter remediations only where evidence supports it.
