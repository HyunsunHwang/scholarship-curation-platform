# Notice Source manifest registry

`config/notice-sources/` is the operational Source Registry for crawler configuration. Each of the nine university manifests is UTF-8 JSON, has deterministic formatting, and is ordered by `sourceId`. Runtime crawler configuration must be loaded with `manifest:<group>`; CSV files remain legacy snapshots/fixtures and `public.notice_sources` remains the foreign-key parent, read-only parity source, and emergency manual DB rollback registry.

## Editing a source

Edit only the applicable `universities/<group>.json`. Do not rename `sourceId`: it is the stable crawler identity and an existing DB foreign-key identity. Keep all string values trimmed, retain empty-string fields when the canonical config has them, use an existing adapter only, and validate selectors/URLs/regular expressions before submitting the change.

Run:

```bash
npm run validate:notice-source-manifests
npm run test:notice-source-manifests
node scripts/export-notice-source-manifests.mjs --from-csv data/notice-sources.csv --check
```

With read-only DB credentials, refresh from DB or compare parity (both tools use `SELECT` only):

```bash
npm run export:notice-source-manifests
npm run compare:notice-source-manifests-db
```

The snapshot is not runtime configuration. It prevents a manifest from introducing an ID outside the known DB FK set. Its `sourceIdSetSha256` is the SHA-256 of sorted source IDs, while manifest and index hashes identify the exact Git configuration used by a crawler report.

The checked-in snapshot was bootstrapped from the latest complete checked-in CSV without DB read access and is marked `unverified_without_db_read`. Until a read-only DB parity report is clean, scheduled execution stays in legacy DB mode. Manual `workflow_dispatch` defaults to `manifest`; `db` is the explicit emergency rollback mode. A manifest validation failure fails the manifest job; it never falls back to DB automatically.

Adding a new source ID is intentionally blocked until the DB FK parent is updated through its separately approved DB process and a fresh read-only snapshot is exported. This change adds no migration, DB write, or schema change.
