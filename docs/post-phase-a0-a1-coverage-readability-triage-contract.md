# Post-Phase A-0/A-1 Coverage, Parser, Detector, and Readability Triage Contract

## Purpose

Post-Phase A-0/A-1 makes three carry-forward risks diagnosable without changing production crawler rules: zero-match false negatives, non-clean parsing, and board/item-level readability. It is a deterministic, read-only fixture foundation, not a claim about nationwide coverage or production crawler readiness.

It is required before F-1 admin UI integration because a review UI cannot safely present a source as supported merely because one item matched, nor can it interpret zero matches as absence evidence.

## A-0: Zero-Match Policy

`zero_match_observed` and `no_match_observed` are observations only. `source_exhaustion_proven` is always false. Prohibited conclusions include `no_scholarships`, `source_empty`, `confirmed_no_scholarship`, and `source_exhausted`.

The source triage model retains crawl depth, list/detail/keyword/candidate counts, reason codes, false-negative risk, manual spot-check need, and keyword/depth/parser follow-up candidates. False-negative taxonomy includes keyword misses, detail/body failures, attachment-only possibility, limited pagination, pinned notices, JS/API boards, selector issues, and encoding concerns. `true_no_recent_scholarship_possible` remains a bounded possibility, not proof, when no structural miss evidence exists.

## A-1: Parser and Readability Policy

Every non-clean item has one or more parser or detector reason codes. The taxonomy includes title/date/URL failures, detail failures, missing or short body, mojibake and replacement characters, selector mismatch, attachment/image-only evidence, canonical identity concerns, duplicate suspicion, keyword misses, second-pass parser, attachment parser, and keyword expansion recommendations.

Encoding evidence is explicit through `replacement_character_count`, `body_replacement_character_ratio`, and `encoding_issue_suspected`. Attachment-only is distinct from a normal parser fix: it records `attachment_parser_recommended`. Keyword expansion is only a reviewed candidate; this contract never changes the production detector rule.

## Board and Item Readability

An item row records list detection, detail URL/fetch/body/date/assets/keyword/candidate outcomes and one `item_readability_status`. A board aggregates item counts and is classified independently as `supported_readable`, `supported_partial_readability`, `list_only_supported`, `detail_access_unstable`, `parser_unstable`, `keyword_detector_unverified`, `zero_match_observed`, `needs_manual_review`, or `blocked`.

One detected scholarship item never promotes a board to `supported_readable` while any item remains unreadable or needs review. This separation is the foundation for bounded source repair work later in the roadmap.

## Non-Goals

- No admin or product UI, DB migration/write, Supabase access, crawler bulk run, or LLM parsing.
- No production detector keyword change.
- No claim that all sources were collected correctly or that a source has no scholarships.
