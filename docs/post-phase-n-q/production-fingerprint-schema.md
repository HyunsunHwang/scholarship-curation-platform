# Production Fingerprint Schema

공통 schema version은 `post-phase-n-fingerprint/v1`이다.

실제 production read-only fingerprint의 evidence contract는 다음과 같다.

```json
{
  "evidence": {
    "evidence_kind": "database_production_read_only",
    "environment": "production"
  },
  "safety": {
    "transaction_read_only": true,
    "ddl_performed": false,
    "dml_performed": false,
    "row_body_dumped": false
  }
}
```

`owner_pending`, `synthetic`, `fixture`, `database_nonproduction`은 실제
production evidence로 인정하지 않는다. 파일명이나 저장 위치도 evidence
kind를 대체하지 않는다.

## Base Catalog

Stage A SQL은 특정 application relation을 가정하지 않고 다음 catalog를
수집한다.

- schemas
- tables와 RLS 상태
- columns
- constraints
- indexes
- policies
- grants
- functions와 built-in definition hash
- triggers
- views
- materialized views

`pgcrypto` 같은 optional extension은 요구하지 않는다. Row body, credential,
connection URL, password, access token은 포함하지 않는다.

## Optional Evidence

Migration metadata와 state distribution은 Stage A catalog에서 relation과
column 존재를 확인한 뒤 runner의 고정 allowlist query로만 조회한다.

상태는 다음 중 하나다.

```text
available
missing_relation
missing_column
unavailable
```

Optional evidence 실패는 base catalog fingerprint를 무효화하지 않는다.
임의의 database identifier를 query 문자열에 삽입하지 않는다.

## Output Validation

Runner는 normalized fingerprint에 runner-side SHA-256을 계산한다. 성공
receipt는 gate match, read-only safety, fingerprint SHA-256, output byte
count를 기록한다. `production_write_performed=false`는 검증된
`transaction_read_only=true`, `ddl_performed=false`,
`dml_performed=false`로부터 산출한다.
