# LLM Baseline Operating Plan — Claude Strong Single Model

Status: design preparation only  
Phase dependency: Phase 0 identity/schema gate, then Phase 1 shadow parity  
Safety: no worker implementation, no migration apply, no external Claude calls in Phase 0

## Baseline model strategy

Initial operating strategy:

```text
Claude strong single model
→ structured analysis
→ full human review
→ accumulate admin-confirmed values
→ build gold dataset
```

Later evaluation path:

```text
low-cost model baseline eval
→ prompt improvement
→ few-shot eval
→ fine-tuning only if needed
→ shadow operation
→ gradual cutover for low-risk cohorts
```

Claude output is a proposal, never canonical truth.

Gold unit:

```text
original Revision
+ attachment extracted text
+ Claude analysis result
+ admin final edits
+ field-level evidence
```

## Current repository Claude configuration review

Code contract in `lib/notice-extraction.ts`:

```text
LLM_PROVIDER accepted values: "openai" | "anthropic"
LLM_API_BASE default for Anthropic: https://api.anthropic.com/v1
LLM_MODEL default if unset: gpt-4o-mini
```

Documentation example in `docs/department-notice-crawler.md`:

```text
LLM_PROVIDER=anthropic
LLM_API_BASE=https://api.anthropic.com/v1
LLM_MODEL=claude-sonnet-5
```

Notes:

- The correct provider string is `anthropic`, not `antropic`.
- Local `.env.local` / `.env.production` inspected during Phase 0 did not define
  `LLM_PROVIDER`, `LLM_MODEL`, or `LLM_API_BASE`.
- Therefore `claude-sonnet-5` is documented intent, not a verified active local runtime setting.
- Phase 0 did not call the external API and did not read or print API keys.

## Pilot cohorts

### 1st pilot — 50 notices

Include only when all are true:

- scholarship-dedicated board
- new recruitment notice
- usable body or attachment extracted text
- Korean text quality is acceptable
- page does not mix multiple Programs

Exclude from the first pilot:

- selection results
- admittee name lists
- corrections / extensions / cancellations
- multi-recruitment pages
- no usable body or attachment text
- severe OCR damage
- high personal-data risk documents

### 2nd pilot — about 200 notices

Expand after the 50-notice baseline. If current sources cannot supply enough eligible
samples, add sources before the second pilot.

## Input and privacy contract for later analysis input builder

Default external model input:

```text
cleaned body text
+ attachment extracted text
```

Do not send original PDF/HWP binaries by default.

Redaction requirements for a later builder:

- detect and mask resident-registration numbers, phone numbers, emails, account numbers,
  personal name lists, and other direct identifiers before provider calls
- exclude result/name-list notices from the initial recruitment pilot cohort
- record redaction status on the analysis run metadata
- never silently shrink content to fit budget; use explicit `budget_deferred` when capped

Phase 0 does not implement a PII detector. It only records the contract.

## Analysis pipeline target shape

```text
Revision durable save
→ asset readiness calculation
→ analysis job reconciliation
→ Claude worker outside DB transaction
→ strict JSON Schema validation
→ AnalysisResult append-only save
→ field evidence save
→ full admin review
→ gold dataset accumulation
```

Recommended future tables:

```text
notice_analysis_jobs
notice_analysis_runs
notice_analysis_results
notice_analysis_evidence
```

Required metadata on runs/results:

```text
provider
model
prompt version
schema version
input fingerprint
request ID
token usage
estimated cost
latency
validation status
raw response retention deadline
admin correction linkage
```

Raw provider response policy:

- pilot: limited retention for debugging
- after stabilization: no retention or very short retention
- raw response is never canonical semantic state

Cost policy:

- measure real usage on the first 30–50 notices before fixing money ceilings
- future controls: per-notice max + monthly max
- over budget → explicit `budget_deferred`, never silent truncation

## Automation boundaries

Allowed to automate later:

- AnalysisResult persistence
- Program/Cycle/EffectiveState proposal creation
- review packet generation

Forbidden initially:

- canonical Program/Cycle confirmation
- scholarships publication without admin approval
- LLM-only Program merge

Decision split:

```text
semantic approval
publication approval
```

UI may combine steps; storage/events must remain separable.

## Implementation status after Phase 0

Implemented now:

- identity/schema alignment needed before durable revision-backed analysis
- documentation for baseline operation and follow-up gates

Not implemented yet:

- analysis job schema / migrations
- durable queue consumer
- Claude worker
- readiness calculator
- admin analysis review UI
- Program/Cycle proposal tables
