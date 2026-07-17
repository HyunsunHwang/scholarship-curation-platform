# Engine Phase 1 — Common crawler

## Outcome

The existing `scripts/crawl-scholarship-notices.mjs` remains the authoritative crawler entrypoint. Its generic HTML source execution now delegates to a reusable common runner and one shared `generic_html` strategy. This is an extraction of the existing path, not a second crawler or ingest pipeline.

Two different source configurations (`ewha_010` and `uos_002`) pass through the same runner and strategy in committed fixtures. A bounded public-HTTP dry-run also observed one item each from `ewha_010` and `ewha_015` without source or detail errors.

## Runtime contract

- `lib/crawler-engine/common-runner.mjs` validates source configuration, resolves identity, executes list/detail requests, and emits normalized source results.
- `lib/crawler-engine/generic-html-strategy.mjs` implements list request, list parsing, detail URL resolution, detail request, detail/body parsing, attachment metadata extraction, and notice normalization.
- Existing `extractFromList`, URL adapters, source configuration loader, detail extraction, bounded pagination, and the authoritative normalized graph are reused.
- `source_key` is the crawler-facing key. It must resolve by exact match to an inventory row's `source_id`, which represents `notice_sources.source_id`. Missing or ambiguous resolution fails closed.
- Each emitted notice retains the legacy fields used by current reports and also includes `source_key`, `source_id`, `original_url`, `canonical_url`, `body`, `image_urls`, and `attachment_metadata` for the normalized crawler graph.

The source-result status set is:

`success`, `empty_observed`, `network_error`, `http_error`, `parser_error`, `configuration_error`, `source_resolution_error`, and `unsupported`.

`empty_observed` is intentionally distinct from `success`. A detail failure is retained on the affected observed notice and does not fabricate body or attachment evidence.

## Source configuration

The common strategy consumes the existing source fields rather than introducing a new identity or configuration store:

- Required: `sourceId` (`source_key`), `sourceName`, `listUrl`.
- Optional list selectors: `listItemSelector`, `linkSelector`, `titleSelector`, `dateSelector`, `noticeUrlPattern`.
- Optional detail selectors: `detailContentSelector`, `detailDateSelector`.
- URL context: `baseUrl`.

CSV and database loaders continue to map snake_case inventory fields into this runtime contract. Engine Phase 1 validation uses committed CSV/fixture inventory only and performs no database access.

## Legacy collector classification

| Existing path | Classification | Phase 1 treatment |
| --- | --- | --- |
| `crawl-scholarship-notices.mjs` | Authoritative scholarship notice runner | Retained and connected to common core |
| `cau_portal` list adapter and source-specific URL adapters | Required exceptional strategies/hooks | Retained; generic path is not forced over incompatible sources |
| `import-*-notice-sources.mjs` | Source inventory/config import utilities | Retained; not a competing crawler |
| `crawl-linkareer-contests.mjs` | Separate contest/education/activity product vertical | Out of scope and retained |
| `import-thedream-scholarships.mjs` | Dedicated external scholarship dataset import | Out of scope and retained |
| post-phase bounded verification scripts | Evidence/diagnostic tooling | Retained; not an authoritative runtime |

No legacy collector was deleted merely to make the architecture appear uniform.

## Evidence

`npm run test:engine-phase-1` covers:

- two source configurations using the same strategy instance;
- selector-driven title/date extraction;
- URL normalization;
- body and attachment metadata;
- authoritative normalized graph compatibility;
- malformed configuration, unresolved identity, unsupported strategy, HTTP failure, parser failure, and empty observation;
- deterministic rerun output;
- parity with the legacy list parser.

The bounded live dry-run used two public university list pages, one page and one item per source, sequential requests, and detail fetching. It observed two items with zero source/detail errors. The zero keyword matches are not treated as crawler failures because the bounded sample's current first items were not scholarship matches.

The sanitised baseline is `reports/engine-phase-1-baseline.json`. Raw live output stays under local `.tmp/` and is not part of the commit.

## Explicitly deferred

Engine Phase 1 adds no new retry/backoff policy, concurrency model, checkpoint/resume mechanism, PDF/HWP/OCR parsing, LLM call, lifecycle/database apply, nationwide crawl, canary, or production operation. Pre-existing runtime controls remain unchanged. These concerns require later phase authorization and evidence.
