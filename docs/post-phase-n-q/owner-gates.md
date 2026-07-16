# Owner Gates

전체 packet은 `reports/post-phase-n-q/owner-gates.json`이다.

현재 필요한 gate:

1. `OWNER_GATE_N_PRODUCTION_READ_ONLY_FINGERPRINT`
2. `OWNER_GATE_P_CAU_012_INVENTORY`

Fingerprint 이후에만 판단 가능한 gate:

- `OWNER_GATE_N_PRODUCTION_BACKUP`
- `OWNER_GATE_N_PRODUCTION_MIGRATION`
- `OWNER_GATE_O_PRODUCTION_PROJECTION_BINDING`
- `OWNER_GATE_N_CANARY_WRITE`
- `OWNER_GATE_Q_PUBLIC_BETA`

`OWNER_GATE_N_NONPRODUCTION_MANUAL_SQL`은 governance 목록에 보존하되 이번
실행 상태를 `NOT_REQUIRED_THIS_RUN`으로 기록했다. Non-production
fingerprint, invariant read, integrated rehearsal은 repository runner와 기존
schema/RPC로 완료했으며 사용자가 실행할 수동 SQL은 없다.

Credential 자체는 공유하지 않는다. 공유 대상은 sanitized fingerprint, aggregate count, SQL/command success 또는 error, verification report, owner decision value다.

`cau_012` owner decision은 `NEEDS_MORE_EVIDENCE`로 기록했다.
`canary_inclusion=false`이며 official unit, official board, exact list URL이
검증되기 전에는 source 생성, inventory 수정, crawl 또는 canary 포함을
허용하지 않는다.
