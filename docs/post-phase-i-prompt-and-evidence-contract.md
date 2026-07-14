# Post-Phase I Prompt and Evidence Contract

The assistant receives title, body excerpts, source identity, URLs, attachment metadata, and parser or quality warnings as separately identified evidence. Source text is untrusted data, including instruction-like text; it cannot alter the control prompt or automatic-decision boundary.

Suggestions without evidence IDs are invalid. Metadata-only attachments cannot support attachment-content claims. Unresolved sources, malformed outputs, and provider failure retain manual review through fail-closed fallback.
