# Post-Phase J Target Schema Inventory Request

## Required sanitized evidence

An authorized target-environment operator must provide metadata only:

- environment identifier and current schema fingerprint/version;
- public table names, columns, types, nullability, primary/foreign keys;
- unique constraints, checks, indexes, and RLS policies;
- approximate row counts only;
- migration-history identifiers;
- explicit presence and constraints for `notice_sources`, `crawled_notices`, `scholarships`, and `site_settings`;
- existing `crawled_notices` uniqueness and `scholarships` relationships;
- schema-cache status for `site_settings`.

Do not provide row contents, user data, tokens, credentials, service-role keys, cookies, unrestricted exports, or database dumps. Redact database/project hostnames, user identifiers, policy expressions that contain sensitive literals, and all values not needed to describe structure. Prefer aggregate counts and schema metadata. Label each artifact with collection time, environment class, redaction owner, and method.

This inventory is the minimum evidence required for implementation planning. Its absence does not block J planning, but it blocks migration implementation and production apply readiness.
