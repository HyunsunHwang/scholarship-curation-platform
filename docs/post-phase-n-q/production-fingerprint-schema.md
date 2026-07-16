# Production Fingerprint Schema

공통 schema version은 `post-phase-n-fingerprint/v1`이다. 구현은 `lib/post-phase-n-q/fingerprint.mjs`, production SQL은 `supabase/post-phase-n-q/001_production_read_only_fingerprint.sql`, 실제 비운영 예시는 `reports/post-phase-n-q/nonproduction-fingerprint.json`이다.

필수 상위 필드:

- `schema_version`, `generated_at`
- `evidence.evidence_kind`, `environment`, `bounded_scope`, `limitations`
- `project`
- `objects.tables`, `indexes`, `constraints`, `policies`, `grants`, `functions`, `triggers`, `views`, `materialized_views`
- `aggregates`
- `safety`

Production SQL은 schema, table, column, type, default, nullability, PK/FK/unique, index, RLS, policy, grant, function/RPC, trigger, view, materialized view, migration metadata와 제한된 상태 분포를 반환한다. row body와 secret은 반환하지 않는다.

Non-production fingerprint는 repository manifest와 실제 DB aggregate를 결합한다. 따라서 column-level completeness는 production parity가 아니라 `static_repository_manifest`로 표시한다. 이 제한은 diff에서 숨기지 않는다.

Evidence kind는 `live_public`, `fixture`, `synthetic`, `static_repository`, `database_nonproduction`, `design_only`, `owner_pending`, `not_authorized` 중 하나만 쓴다.
