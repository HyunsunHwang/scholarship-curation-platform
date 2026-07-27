# Phase 2 parser remediation plan

## Stage 0 — completed by this commit

Freeze the historical 87-source target set, generate a current baseline from the 545-source post-merge runtime report, and document the existing analyzer/report boundary defects. No crawler, parser, manifest, profile, or source URL behavior changes occur in this stage.

## Stage 1 — completed

Phase-2 status interpretation and evidence invariants now belong to the operational analyzer. The report generator supplies paired evidence but no longer assigns Source-ID-based final states or defaults candidate recall to verified. The existing crawler observation contract remains unchanged.

## Stage 2 — completed

Deterministic same-HTML control/treatment candidate comparison evidence now requires identical HTML SHA-256 values and produces fail-closed candidate arithmetic. The analyzer consumes the resulting evidence directly; no second final-status system is introduced.

## Stage 3 — structural clustering framework completed

The framework groups only audited same-HTML evidence under `phase3-structural-cluster-v1`.
Its structural signature contains normalized DOM candidate family and provenance, parser strategy/origin, list/link/title/date selector presence, normalized node-locator templates, navigation/pagination membership, parser profile or adapter family, content topology, and origin-free URL-identity shapes (pathname template, query keys, identity hints, path shape, fragment handling, and extraction mode).

The signature deliberately excludes Source identity, university/origin, runtime result, capture time/hash/ID, recall result, and evidence completeness. Therefore Sources with the same structure but different recall evidence share a cluster; their individual evidence state remains in the member record.

All same-capture provenance and candidate-comparison arithmetic, candidate identity, classification, URL-array, and comparison-hash contracts are fail-closed before clustering. A Source without a capture remains in the separate `capture_required` list with the `same_html_capture` queue; it never receives an inferred structural signature or safe state.

The framework explicitly distinguishes a real DOM locator from the legacy URL-based `candidate_node_fingerprint`. URL-shaped fingerprints retain only candidate origin plus the origin-free URL identity structure; they never become a DOM locator. Required same-capture source/capture IDs, URLs, and hashes are non-empty and HTTP(S)-validated before equality checks. Adapter family is included when existing evidence exposes it, otherwise it remains `null`.

The tracked 87-Source baseline has a fixed regression result of `0 clustered / 87 capture required` until authoritative captures are added. Actual 87-Source bounded capture collection, actual clustering beyond `0/87`, and fixture-first selector, profile, URL, or adapter remediation are not started and remain separate work.
