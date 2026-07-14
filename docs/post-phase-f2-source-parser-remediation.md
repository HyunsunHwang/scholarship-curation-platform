# Post-Phase F-2 P0 Source / Parser Remediation

## Purpose

Post-Phase F-2 applies bounded, fixture-first remediation to P0 source/parser risks identified by Post-Phase A Foundation. It does not establish full source coverage, execute a full crawl, or add a production apply path.

## Relationship to A Foundation and F-1

Post-Phase A supplied the remediation priority decisions. F-2 derives its P0 targets from `reports/post-phase-a-remediation-priority-decisions.json` and records each as resolved or deferred. The existing F-1 read-only admin diagnostics consume the F-2 report so reviewers can see a bounded remediation status, before/after classification, and next action without a database write path.

## P0 Decisions

| P0 decision | Result | Bounded evidence | Deferred work |
| --- | --- | --- | --- |
| A-P0-001 selector/body parser | Deferred | `cau_011` uses `#bo_v_con`; `cau_013` uses `.entry-content`; both retain `needs_review`. | `cau_003` needs a safely resolvable list/detail fixture before a parser change. |
| A-P0-002 source-specific adapter | Deferred | `cau_010` only accepts canonical KBoard `uid` plus `mod=document` URLs and remains `needs_review`. | `cau_012` needs explicit source inventory and fixture evidence. |
| A-P0-003 URL canonicalization | Resolved | `cau_011` accepts only `bo_table=sub5_1` plus numeric `wr_id`, removes tracking parameters, and rejects board sorting links. | Broader source variants require separately approved evidence. |

The report has one resolved P0 decision and two deferred decisions. Deferred is an explicit safe outcome, not an implementation claim.

## Implemented Scope

- Source-specific body selectors for `cau_011` and `cau_013`.
- Fail-closed canonical URL rules for `cau_010` KBoard document links and `cau_011` board detail links.
- Before/after body and URL fixtures.
- Four public bounded source observations with list/detail status, body evidence, canonical URL state, attachment metadata observation, limitation, and next action.
- Read-only F-2 reports plus F-1 diagnostic fields and summary.

## Fail-Closed Policy

Successful bounded evidence routes items to `needs_review`, never automatic `clean`. Invalid list/sort links resolve to an empty URL. `cau_003` remains blocked because no safely resolvable detail URL was observed. The report explicitly prohibits source-exhaustion and zero-match absence claims.

## Non-Goals and F-3 Handoff

F-2 does not implement P1 encoding normalization or attachment parsing. It does not alter keyword detection, run a deeper-crawl experiment, execute a full crawl, connect to Supabase, create a migration, or add production apply/approval actions. F-3 should receive the attachment/body interpretation and encoding backlog only with fresh bounded fixtures and retained review safeguards.

## Roadmap Impact

G/H/I/J planning can treat the bounded P0 results as review evidence, not operational readiness or nationwide coverage. Any schema, UI workflow, or production migration remains subject to separate team review and explicit approval.
