# Owner Evidence And Scoped Diff

Production read-only fingerprint evidence is accepted only from explicit owner-supplied file paths. Before validation, local owner output and receipt are copied to a sibling archive outside the repository. The raw files, archive, and local full diff are never committed.

The acceptance verifier records byte equality, raw SHA-256, embedded and receipt legacy hashes, receipt safety flags, row-body absence, credential-pattern scans, object counts, optional-evidence limitations, and a canonical deterministic hash. The canonical hash uses codepoint string comparison rather than locale-sensitive collation. A canonical hash that differs from the legacy hash is recorded and does not invalidate otherwise consistent legacy evidence.

Migration readiness compares only the `public` schema. Auth, storage, realtime, extensions, vault, `supabase_migrations`, and other managed schemas are excluded from object-level classification and recorded as aggregate exclusion counts. The tracked summary contains only counts, evidence coverage, known beta target table names, blockers, and limitations. Full owner schema object details remain local-only outside the repository.

Evidence coverage is declared separately for tables, columns, indexes, constraints, policies, grants, functions, triggers, views, and materialized views. Object kinds without both production and non-production evidence remain `production_only_evidence`, `nonproduction_only_evidence`, or `insufficient_evidence`; they are not promoted to unexpected-object compatibility findings.

The optional aggregate contract uses `notice_sources.enabled`. Existing owner evidence collected with the historical `notice_sources.is_enabled` request remains immutable and is treated as a known limitation rather than being rewritten.

Passing owner evidence changes only the production fingerprint gate to `PASS_OWNER_READ_ONLY`. Migration readiness remains evidence-aware, and production migration, canary rollout, and Public Beta remain separately unauthorized or held until their own gates are satisfied.
