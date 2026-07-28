# LLM Ingestion Unit 2 — Program/Cycle and Projection

Status: implemented locally; migration not applied

## Domain boundaries

- Program is the durable scholarship scheme: canonical name, aliases, operating/funding
  organizations, and stable identity.
- Cycle is one recruitment round under a Program: label/year/term, dates, benefits,
  eligibility, documents, application method, and Notice/Revision lineage.
- `scholarships` remains a compatibility public read model. It is not canonical truth.

Analysis approval, canonical approval, and publication are separate actions.

## Flow

```text
schema-valid approved semantic review
→ deterministic Program/Cycle proposal
→ conservative existing Program candidates
→ administrator proposal decision
→ atomic Program/Cycle canonicalization
→ explicit hidden scholarships projection
```

Proposal lineage includes the analysis result, semantic review event, Notice, Revision,
field-evidence snapshot, source snapshot, and proposal fingerprint. Replaying one approved
review produces the same proposal ID and fingerprint.

## Matching

The only suggested automatic candidate is one exact normalized alias/name match with an exact
operating-organization match. A name match with a different organization is shown for review
and is never selected. Fuzzy similarity never merges or updates a Program.

## Canonical approval

`approve_scholarship_program_cycle_proposal` locks a pending proposal and validates:

- current admin permission
- schema-valid approved semantic review
- result/review/proposal Notice and Revision lineage
- existing Program/Cycle targets
- idempotency event

It supports new Program/new Cycle, existing Program/new Cycle, existing Program/existing Cycle,
needs revision, and rejection. The review event is append-only. Canonical values retain proposal
and actor lineage.

Admin UI:

```text
/admin/program-cycle-proposals
```

The proposal detail shows the Revision, effective semantic output, Program/Cycle patches,
existing targets, decisions, history, and an explicit projection action.

## Projection

Projection inserts a new `scholarships` compatibility row only for an approved Cycle. It records
a unique Cycle↔scholarship link and is idempotent. It refuses a matching unlinked manual row.
The initial row always has:

```text
is_verified = false
list_on_home = false
projection_status = review_safe
```

Therefore projection is not publication. Program name and organization, Cycle dates/benefits/
eligibility/documents/application method, and Revision detail URL are mapped without replacing
the canonical JSON structures.

## Commands

```bash
npm run test:analysis-unit-2

node scripts/create-program-cycle-proposal.mjs \
  --analysis-review-id <id> \
  --dry-run

node scripts/create-program-cycle-proposal.mjs \
  --analysis-review-id <id> \
  --allow-db-write

node scripts/project-cycle-to-scholarship.mjs \
  --cycle-id <id> \
  --allow-db-write
```

Proposal creation defaults to dry-run unless `--allow-db-write` is supplied. Projection refuses
to run without its explicit write flag. Both use the exact non-production Post-Phase L target
guard; no production-write flag exists.

## Migration order

Apply only to the verified non-production Post-Phase L target:

1. `004_notice_analysis_schema.sql`
2. `005_notice_analysis_review_and_finalize.sql`
3. `006_program_cycle_canonical_and_projection.sql`

`006` adds Program, alias, Cycle, proposal, proposal-review, and projection-link tables; admin
RLS; the corrected-output DB guard; atomic approval; and hidden projection RPCs. No migration
was applied during this implementation.

## Known limits and Unit 3 checks

- No fuzzy merge, canonical merge editor, bulk legacy migration, or automatic publication.
- Full JSON Schema enforcement remains application-side; the DB repeats required structure and
  lineage checks as defense in depth.
- DB RPC concurrency and projection smoke tests require `004`–`006` on the non-production target.
- Before Unit 3, apply and smoke-test the migrations, inspect initial Program duplicate
  candidates, verify compatibility field mappings, and define a separate publication decision
  and notification ledger.
