# Production Read-Only Investigation Runbook

이 절차는 production schema를 변경하지 않는 owner-gated catalog
fingerprint 실행 절차다. Codex remediation 과정에서는 production에
접속하지 않았다.

## 실행 구성

- Gate: `OWNER_GATE_N_PRODUCTION_READ_ONLY_FINGERPRINT`
- Stage A SQL:
  `supabase/post-phase-n-q/001_production_read_only_fingerprint.sql`
- Runner:
  `scripts/post-phase-n/run-production-read-only-fingerprint.mjs`
- Fingerprint:
  `reports/post-phase-n-q/production-fingerprint-owner-output.json`
- Receipt:
  `reports/post-phase-n-q/production-fingerprint-execution-receipt.json`
- Required local tool: `psql`

Stage A는 application table이 전혀 없더라도 catalog metadata를 수집한다.
Stage B는 Stage A에서 relation과 column이 확인된 고정 allowlist 항목만
read-only transaction으로 조회한다. Optional relation, migration metadata,
또는 aggregate 권한이 없으면 해당 항목을 `missing_relation`,
`missing_column`, 또는 `unavailable`로 기록하고 base fingerprint는
유지한다.

## Owner 실행

Credential은 owner의 secret store에서 로컬 환경변수에만 주입한다.
값을 console, report, shell history 또는 repository에 기록하지 않는다.

```powershell
$env:POST_PHASE_N_PRODUCTION_READ='true'
$env:POST_PHASE_N_PRODUCTION_PROJECT_REF='synwudnxdkybwihwmtak'
$env:POST_PHASE_N_PRODUCTION_READ_CONFIRMATION='READ_ONLY_PRODUCTION_FINGERPRINT_synwudnxdkybwihwmtak'
$env:POST_PHASE_N_PRODUCTION_DATABASE_URL='<owner local secret>'

@(
  'POST_PHASE_N_PRODUCTION_READ',
  'POST_PHASE_N_PRODUCTION_PROJECT_REF',
  'POST_PHASE_N_PRODUCTION_READ_CONFIRMATION',
  'POST_PHASE_N_PRODUCTION_DATABASE_URL'
) | ForEach-Object {
  "$_=" + [bool](Get-Item "Env:$_" -ErrorAction SilentlyContinue)
}

node scripts/post-phase-n/run-production-read-only-fingerprint.mjs
$LASTEXITCODE
```

## 성공 기준

Console에 출력된 정적 boolean만으로 성공을 판정하지 않는다. Runner가
fingerprint JSON을 parse하고 다음 값을 exact 검증한 경우에만 exit code
0과 `passed=true` receipt를 생성한다.

```text
schema_version = post-phase-n-fingerprint/v1
evidence.evidence_kind = database_production_read_only
evidence.environment = production
safety.transaction_read_only = true
safety.ddl_performed = false
safety.dml_performed = false
safety.row_body_dumped = false
```

다음 두 파일이 모두 생성되고 receipt의 SHA-256과 byte count가 실제
fingerprint 파일에 대응해야 한다.

```text
reports/post-phase-n-q/production-fingerprint-owner-output.json
reports/post-phase-n-q/production-fingerprint-execution-receipt.json
```

불일치, malformed JSON, gate mismatch 또는 Stage A 실패 시 runner는
nonzero로 종료하고 stale evidence 파일을 남기지 않는다. Optional Stage B
조회 실패만 `unavailable`로 기록하며 전체 catalog fingerprint를
실패시키지 않는다.

## 정리

```powershell
Remove-Item Env:POST_PHASE_N_PRODUCTION_READ,Env:POST_PHASE_N_PRODUCTION_PROJECT_REF,Env:POST_PHASE_N_PRODUCTION_READ_CONFIRMATION,Env:POST_PHASE_N_PRODUCTION_DATABASE_URL -ErrorAction SilentlyContinue
```

공유 대상은 sanitized fingerprint JSON, execution receipt JSON, command
exit code뿐이다. Connection URL, password, key, token은 공유하거나 commit하지
않는다.
