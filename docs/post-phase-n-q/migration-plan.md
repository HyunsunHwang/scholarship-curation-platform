# Migration Plan

상세 machine-readable 계획은 `reports/post-phase-n-q/migration-plan.json`이다. 상태는 `CONDITIONAL_ON_PRODUCTION_FINGERPRINT`이고 production migration은 `NOT_AUTHORIZED`다.

순서는 다음과 같다.

1. additive graph/review schema
2. constraints and indexes
3. RLS, grants, RPC
4. legacy compatibility binding
5. review-to-public projection
6. controlled backfill
7. application cutover

각 단계는 precondition, object 범위, lock risk, compatibility risk, row impact, idempotence, rerun, verification, rollback, irreversible evidence, owner를 가진다.

Non-production 근거:

- schema apply/rollback/reapply: Post-Phase L reports
- projector and logical recovery: `reports/post-phase-n-q/integrated-rehearsal.json`
- current schema aggregate: `reports/post-phase-n-q/nonproduction-fingerprint.json`
- synthetic diff engine: `reports/post-phase-n-q/schema-diff.json`

Production fingerprint 없이 final SQL을 확정하지 않는다. 기존 L fresh-project baseline을 production에 그대로 실행하는 것은 금지한다.
