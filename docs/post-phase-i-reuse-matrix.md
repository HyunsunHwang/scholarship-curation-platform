# Post-Phase I Reuse Matrix

| Requirement | Existing implementation path | Current behavior | Decision | Reason | Compatibility risk |
| --- | --- | --- | --- | --- | --- |
| Provider boundary | `lib/notice-extraction.ts` | OpenAI-compatible and Anthropic calls can generate drafts and may be used by DB-writing actions. | reuse as reference | I uses no provider key or live call; replay validates the safer contract. | Do not route I output through draft persistence. |
| Review UI | `app/admin/crawler-review/page.tsx` | Report-backed, read-only diagnostics. | extend | I adds aggregate assistance metrics to this route. | No actions, state mutation, or separate review UI. |
| Evidence and quality | F-1/F-2/F-3/H reports and fixtures | Existing source, parser, attachment, and quality diagnostics. | reuse | I cases retain those limitations as evidence. | LLM cannot resolve source or parser state. |
| Public exposure | `lib/scholarships/public-scholarship-exposure-policy.ts` | Fail-closed exposure policy. | reuse | I metrics require zero exposure changes. | LLM output is never an exposure input. |
| Structured extraction | `lib/notice-extraction.ts` | Normalizes untrusted LLM JSON. | extend | I adds evidence-linked replay schema, not a second extractor. | Mock/replay quality is not live model quality. |
