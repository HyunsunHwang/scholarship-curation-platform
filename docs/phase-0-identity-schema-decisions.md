# Phase 0 — Approved Ingestion Identity Decisions

Status: approved for Phase 0 implementation  
Scope: identity/schema gate only  
Not a permanent product freeze: each decision has an explicit follow-up review gate.

## Approved decisions applied in Phase 0

| Topic | Approved decision |
| --- | --- |
| Inline section | One detail page → one Notice. Sections are evidence, not independent Notice identity. |
| Notice identity kinds | `external_article_id` preferred; otherwise `canonical_detail_url`. |
| URL alias uniqueness | `unique(source_id, normalized_url_hash)` |
| Source registry | Git manifest for structural config; DB for operational overlay. No scheduled cutover in Phase 0. |
| Ingestion transition | Keep legacy ingest. Add shadow/normalized comparison before any cutover. |
| LLM analysis eligibility | Title scholarship keyword OR scholarship-dedicated source. |
| LLM input | Cleaned body text + attachment-extracted text. No raw PDF/HWP binary by default. |
| Automation | AnalysisResult and Program/Cycle proposal only. No canonical write or public publish. |
| Approval split | Semantic approval and publication approval remain separable decisions. |
| Program/Cycle | Proposal-first. Canonical tables wait for observed patterns. |
| Admin review | 1st pilot 50 notices; 2nd pilot about 200 notices. |

## Runtime contracts after Phase 0

### Formal Notice identity

```text
external_article_id
  OR
canonical_detail_url
```

`inline_section_id` remains crawler observation/evidence metadata. It must not appear as
`ingestion_notices.identity_kind`.

### Section preservation

Section evidence is preserved on the revision payload:

```text
ingestion_notice_revisions.normalized_payload.inline_sections[]
  section_id
  section_title
  section_order
  section_text
  section_links
  section_date_evidence
  display_url
```

### URL alias

```text
alias row identity / upsert conflict / SQL unique
= source_id + normalized_url_hash
```

Different sources may share one normalized URL. Within one source, one normalized URL
owns exactly one Notice.

### Handoff readiness

Handoff unblocks only when formal identity kinds are schema-supported and required
canonical fields exist. Status:

```text
ready_for_normalized_graph_plan
```

This does **not** mean scheduled cutover, production dual-write, or analysis worker enablement.

## Conservative decision follow-up matrix

| Initial decision | Validation data to collect | Review timing | Follow-up work |
| --- | --- | --- | --- |
| Inline section as evidence | Count/rate of pages with multiple independent recruitments | After 1st and 2nd pilots | Redesign independent Notice identity if frequency is high |
| One URL per source = one Notice | Cases of multiple recruitments under one URL | Around 200-notice sample | Review identity-kind-specific alias contracts |
| Legacy and graph in parallel | Notice/Revision/Asset/review parity | After shadow gate passes | Scheduled graph cutover |
| Title keyword or dedicated source | Missed notices found in manual review | After 50 and 200 notices | Consider `student_support_broad` expansion |
| Body + attachment extracted text | Errors caused by table/image omission | After 50 notices | Limited multimodal input review |
| GitHub Actions consumer | Backlog, queue wait, throughput | After real worker operation | Always-on worker review |
| Proposal-only automation | Admin accept/edit rates | After 200 notices | Limited low-risk auto-apply review |
| Split semantic/publication approval | Review latency and accidental-publish prevention | After admin pilot | UI simplification while keeping separate events |
| Program/Cycle proposal first | Duplicate/merge/split candidate patterns | After 200 notices | Canonical schema confirmation |
| Admin approval for Program/Cycle | Top-1 accept rate and wrong-link rate | After sufficient sample | Exact-match auto-link review |
| Initial full review | Field edit rates and source-level accuracy | After 50 and 200 notices | Reduce review for low-risk cohorts |
| Claude strong-model baseline | Field accuracy, cost, latency | After 50 and 200 notices | Low-cost model eval / optional fine-tuning |
| Limited raw response retention | Debugging need vs security burden | After pilot ends | Drop retention or shorten window |

Do not invent numeric thresholds in this document. Collect the metrics first, then decide.

## Explicit non-goals for Phase 0

- scheduled normalized-graph cutover
- production DB writes
- analysis job/worker implementation
- canonical Program/Cycle tables
- automatic scholarship publication
- SQL identity enum expansion for `inline_section_id`
