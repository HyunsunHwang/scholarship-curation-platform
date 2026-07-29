# DB-independent Minimal LLM Evaluation

## Scope

This evaluation is deliberately limited to four fixed, previously verified
`ewha_068` notices. It does not import or access Supabase, crawler ingestion,
source registry, queue/claim/lease, routing, review UI, pilot control plane, or
publication paths. DB reads/writes and production access are zero.

## Fixture

`fixtures/llm-analysis/ewha-real-notices-4.json` contains only articles
`365300`, `365405`, `365411`, and `365911`. Each record preserves title, date,
original URL, cleaned body text, attachment name/URL metadata, retrieval time,
encoding-damage flag, and a SHA-256 body hash. No binary attachment, cookie,
header, or secret is stored.

## Offline checks

The evaluator rejects non-four-record fixtures, non-`ewha_068` sources, duplicate
article/URL values, missing bodies, hash mismatches, invalid models, missing live
permission, invalid schema shapes, invalid ISO dates, missing evidence, and
evidence not found as a normalized body substring. Its dry-run made zero provider
calls. The evaluator imports no Supabase/DB/pilot/routing modules.

## Provider contract

- Model allowlist: `claude-sonnet-4-6` only
- Maximum calls: 4; one notice at a time; no retry, fallback, tools, or parallelism
- Live execution additionally requires `--live` and command-scoped
  `POST_PHASE_L_ALLOW_LIVE_PROVIDER=true`.

## Result

The first call (`ewha_068_365300`) reached the provider and returned parseable
structured JSON. It extracted the scholarship name, organizer, benefit, core
constraints, and contact consistently with the body. It nevertheless failed the
strict contract:

- `application_period.start` and `.end` used `YYYY.MM.DD`, not ISO `YYYY-MM-DD`.
- The application-method evidence was semantically close but not an exact
  normalized substring of the fixture body.

The second issue is a critical evidence indicator because application method is a
critical field. The evaluator stopped after that first validation failure, so the
remaining three notices were not sent to any provider. The sanitized structured
result, token usage, and manual assessment are in
`reports/llm-analysis/ewha-minimal-evaluation.json`; no raw provider response is
stored.

## Decision: HOLD

This does not yet justify using the model as a review assistant. The single
observed output was mostly factually aligned, but it failed the required date and
verbatim-evidence contract. No automatic prompt repair, retry, or second model was
used.

## Explicit limitations

This evaluation does not prove production readiness, crawler stability, source
registry alignment, DB ingest or review-queue integration, UI usability, batch
behavior, routing/escalation, provider cost efficiency, generalization to other
universities, or automatic publication safety. It tests only whether one LLM can
turn verified scholarship-notice text into evidence-grounded structured data.
