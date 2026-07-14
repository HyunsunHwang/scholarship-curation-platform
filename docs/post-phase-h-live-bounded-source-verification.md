# Post-Phase H - Live Bounded Source Verification

This closure cross-checks the fixture-backed H comparison against one bounded, read-only public-endpoint observation per target source. It is a point-in-time diagnostic, not a coverage, absence, crawler-quality, or public-exposure claim.

## Observed outcome

- `cau_002` was blocked fail-closed after the two permitted retries because the local runtime could not verify the source TLS certificate chain. TLS verification was not disabled.
- `cau_003`, `cau_007`, and `cau_008` returned HTTP 200 for their configured list URLs and for at most three generic anchor candidates each. None has a source-specific list selector or detail URL pattern in the committed source configuration, so those candidates are not credited as notice-detail mappings.
- No attachment was downloaded. The recorded attachment result is metadata-only and, for `cau_008`, remains unverified because the bounded candidates were not established as notice details.
- The live run did not change the public exposure count. It made no review decision, database access, write, migration, or operational crawler workflow execution.

## Evidence model

The tracked artifacts keep the four layers distinct:

- `fixture_backed_baseline` and `fixture_backed_after` remain deterministic fixture evidence.
- `live_observation` records sanitized request provenance, HTTP outcome, final URL, retries, timeouts, parser signals, and a source-specific limitation.
- `live_inference` explicitly rejects equivalence, source-exhaustion, scholarship-absence, and exposure conclusions.
- `unverified_backlog` assigns the TLS/runtime and source-specific mapping gaps for later work.

The evidence is stored in `reports/post-phase-h-live-bounded-source-verification.json`, `reports/post-phase-h-live-vs-fixture-comparison.json`, and the minimal sanitized fixture under `fixtures/post-phase-h/live/`. No raw HTML, cookies, credentials, or downloaded files are retained.

## Closure judgment

Post-Phase H live verification is **PASS** under the allowed evidence-backed-unresolved exit condition: all four targets produced a bounded, attributable outcome, while no unsupported parser or coverage success was claimed. The next implementation work is source-specific list-to-notice mapping configuration and a bounded recheck; the TLS issue requires an approved runtime trust-store remediation rather than an insecure bypass.
