# Production Read-Only Investigation Runbook

이 문서는 production schema를 변경하지 않는 owner-gated catalog fingerprint 실행 절차를 설명한다. 현재 production fingerprint gate 상태는 `OWNER_PENDING`이며, 이 문서만으로 production 실행이 승인되지는 않는다.

## 실행 구성

- Gate: `OWNER_GATE_N_PRODUCTION_READ_ONLY_FINGERPRINT`
- SQL: `supabase/post-phase-n-q/001_production_read_only_fingerprint.sql`
- Runner: `scripts/post-phase-n/run-production-read-only-fingerprint.mjs`
- Fingerprint: `reports/post-phase-n-q/production-fingerprint-owner-output.json`
- Receipt: `reports/post-phase-n-q/production-fingerprint-execution-receipt.json`
- Required local tool: `psql`

SQL은 `BEGIN TRANSACTION READ ONLY`로 시작하고 마지막에 `ROLLBACK`한다. Application row body를 덤프하지 않으며 catalog metadata와 제한된 상태 집계만 수집한다.

## Connection URL 형식

Runner는 다음 두 Supabase PostgreSQL 연결 형식만 project ref 검증 대상으로 사용한다.

### Direct connection

```text
postgresql://postgres@db.<project-ref>.supabase.co:5432/postgres
```

위 표기는 password를 생략한 구조 예시다. Direct connection에서는 project ref를 `db.<project-ref>.supabase.co` hostname에서 검증한다.

### Shared Session pooler

```text
postgres://postgres.<project-ref>@aws-<region>.pooler.supabase.com:5432/postgres
```

위 표기는 password를 생략한 구조 예시다. Shared Session pooler에서는 다음 조건을 모두 검증한다.

- hostname이 정확한 Supabase `*.pooler.supabase.com` 하위 호스트다.
- URL username이 정확히 `postgres.<project-ref>` 형식이다.
- username에서 얻은 project ref가 expected production ref와 일치한다.
- 포트가 Session mode의 `5432`이거나 URL에서 생략돼 기본 PostgreSQL 포트로 해석된다.

IPv4-only 환경에서는 Direct connection 대신 Shared Session pooler의 포트 `5432`를 사용할 수 있다. Transaction pooler 포트 `6543`은 이 runner에서 지원하지 않으며 fail-closed 처리한다.

URL 전체에 project ref 문자열이 포함됐다는 이유만으로는 gate를 통과하지 않는다. 가짜 유사 도메인, 외부 호스트, 잘못된 username, 다른 project ref는 모두 차단한다.

## Windows `psql` 연결 전달

Windows/libpq 환경에서는 connection URI 전체를 `PGDATABASE`에 넣지 않는다. Runner는 owner URL을 parse한 뒤 다음 discrete libpq 환경변수로 분리해 child `psql` process에만 전달한다.

```text
PGHOST     = parsed hostname
PGPORT     = parsed port 또는 5432
PGUSER     = decoded username
PGPASSWORD = decoded password
PGDATABASE = decoded database pathname
```

URL query의 `sslmode`만 allowlist 값일 때 `PGSSLMODE`로 전달한다. URL에 `sslmode`가 없으면 owner shell의 기존 `PGSSLMODE`를 유지한다. 다른 query parameter는 child 환경변수로 확장하지 않는다.

Runner는 connection URL을 `--dbname` argument로 전달하지 않으며, 전체 URL이나 password를 command line, console, receipt, report에 포함하지 않는다. Parent process의 Supabase API key와 무관한 환경변수도 child process에 전달하지 않는다.

Malformed URL, unsupported protocol, hostname·username·password·database name 누락, unsupported `sslmode`, project-ref mismatch는 `psql` spawn 전에 fail-closed 처리한다.

## Owner 실행

Credential은 owner의 local secret store에서 현재 shell 환경변수로만 주입한다. 실제 값은 console, report, shell history 또는 repository에 기록하지 않는다.

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

환경변수 존재 여부만 확인하고 URL이나 credential 값을 출력하지 않는다.

## 성공 기준

Runner가 fingerprint JSON을 parse하고 다음 값을 정확히 검증한 경우에만 exit code `0`과 `passed=true` receipt를 생성한다.

```text
schema_version = post-phase-n-fingerprint/v1
evidence.evidence_kind = database_production_read_only
evidence.environment = production
safety.transaction_read_only = true
safety.ddl_performed = false
safety.dml_performed = false
safety.row_body_dumped = false
```

Gate mismatch, malformed JSON 또는 SQL 실패 시 nonzero로 종료하며 stale owner output과 receipt를 남기지 않는다. Optional catalog 조회 권한이 없으면 해당 항목을 `unavailable`로 기록하되 credential은 어떤 결과에도 포함하지 않는다.

## 정리

```powershell
Remove-Item Env:POST_PHASE_N_PRODUCTION_READ,Env:POST_PHASE_N_PRODUCTION_PROJECT_REF,Env:POST_PHASE_N_PRODUCTION_READ_CONFIRMATION,Env:POST_PHASE_N_PRODUCTION_DATABASE_URL -ErrorAction SilentlyContinue
```

공유 가능한 결과는 sanitized fingerprint JSON, execution receipt JSON, command exit code뿐이다. Connection URL, password, key, token은 공유하거나 commit하지 않는다.
