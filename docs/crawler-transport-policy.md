# Crawler transport policy

## 책임 경계

장학 공고 Source 설정은 수집 대상과 parser/adapter를 정의하고,
`config/crawler-transport/transport-policies.json`은 서버에 연결하는 방법만
정의한다. DB, manifest, CSV 중 어느 Source Registry 입력을 사용하더라도
transport 정책은 이 Git JSON 파일에서 동일하게 해석된다.

실행 흐름은 다음과 같다.

```text
loadSources()
→ transport registry schema/semantic validation
→ 모든 Source의 EffectiveTransportPolicy 해석
→ source 필터와 checkpoint 생성
→ SourceExecutionContext(source + policy + client)
→ 목록·상세·adapter API·첨부/문서·진단 probe
```

메인 스레드가 registry를 한 번 읽는다. worker에는 직렬화된 최종 정책만
전달하며 worker가 JSON을 다시 읽거나 binding을 해석하지 않는다.

## 정책 우선순위와 안전 상한

정책은 다음 순서로 합성된다.

```text
코드 소유 안전 상한
→ registry defaults
→ profile
→ 낮은 priority부터 source/hostname/group binding
→ 제한된 runtime override
```

코드 상한은 timeout 120초, retry 3회, retry delay 30초, redirect 10 hop,
response 50 MiB다. runtime override도 이 상한을 우회할 수 없다.
기존 크롤러가 환경변수 미지정 시 IPv4를 사용하던 동작을 보존하기 위해
현재 registry 기본 `dnsFamily`도 `ipv4`다.

기본 TLS는 `strict`다. `insecure-exact-host`는 정확한 hostname,
사유, 증거 커밋, 만료일이 모두 있어야 한다. wildcard와 만료된 예외는
실행 전에 fail-close 된다. insecure Undici Agent는 정확한 hostname을
dispatcher key에 포함하므로 redirect된 다른 host에 예외가 재사용되지
않는다. HTTP 요청에는 TLS 예외가 적용됐다고 기록하지 않는다.

현재 예외는 다음 두 Source로 제한된다.

- `cau_002` / `econ.cau.ac.kr`
- `hanyang_009` / `hyurban.hanyang.ac.kr`

예외는 `2026-12-31`에 만료된다. 만료 전에 인증서 상태를 재검증한 뒤
strict로 복구하거나, 새 증거와 사유로 만료일을 명시적으로 갱신해야 한다.
분석기가 예외를 자동 생성하거나 활성화하지 않는다.

HTTP list URL은 `preserve-http` binding이 명시된 Source만 허용된다.
TransportClient는 URL을 임의로 HTTPS로 승격하지 않는다. HTTPS에서 HTTP로
redirect되는 downgrade는 별도의 redirect 허용 설정이 없으면 차단된다.

## 공통 TransportClient

다음 경로는 모두 같은 Source별 TransportClient를 사용한다.

- 일반 목록 및 상세 HTML
- 중앙대 포털 form/JSON API adapter
- 첨부파일 HEAD/GET와 문서 parser 원문
- non-candidate diagnostic detail probe

redirect는 `manual`로 처리하며 매 hop마다 Location, hostname, cross-host,
HTTPS downgrade, exact-host TLS 적용 여부, 새 dispatcher를 확인한다.
authorization과 cookie는 cross-host redirect에서 제거한다.

`common-runner`의 source attempt와 TransportClient의 request attempt는
서로 다른 개념이다.

```text
source attempt
= 목록부터 상세 처리까지 Source 전체의 논리 재시도

request attempt
= 한 HTTP 요청의 물리 재시도
```

production 실행은 common-runner가 하위 요청의 `retryCount`를 0으로 전달해
숨겨진 nested retry를 막는다. 중앙대 adapter도 동일한 계약을 사용한다.
물리 fetch 수, request retry 수, 실제 delay, Retry-After 선택 근거는
`transport_evidence`에 기록된다.

## 환경변수 호환

다음 기존 변수는 제한된 runtime override로 계속 지원한다.

- `CRAWL_TIMEOUT_MS`
- `CRAWL_RETRY_COUNT`
- `CRAWL_RETRY_BACKOFF_MS`
- `CRAWL_RETRY_MAX_DELAY_MS`
- `CRAWL_RETRY_JITTER_RATIO`
- `CRAWL_FORCE_IPV4`
- `CRAWL_USER_AGENT`
- `CRAWL_FALLBACK_CHARSET`

`CRAWL_ALLOW_INSECURE_TLS_HOSTS`는 deprecated exact-host 호환 입력이다.
registry에 이미 승인된 hostname만 사용할 수 있고, wildcard나 registry
밖 host는 fail-close 된다. 사용 시 경고와 override evidence가 남는다.

비상 테스트에서는 `CRAWL_TRANSPORT_POLICY_PATH`로 다른 정책 파일을 지정할
수 있다. 적용된 registry와 Source별 정책 fingerprint가 report와
checkpoint에 기록되므로 정책 변경 후 이전 checkpoint resume은 거부된다.

GitHub Actions는 timeout, retry, IPv4, TLS host를 대학별 shell case로
재정의하지 않는다. 운영 전송 정책의 정본은 registry JSON이다.

## 검증과 변경 절차

정책 수정 후 다음을 실행한다.

```bash
npm run test:crawler-transport
npm run test:crawler-runtime-modules
npm run test:engine-phase-1
npm run test:engine-phase-2
npm run test:operational-crawl-diagnostics
npm run test:crawler-performance-telemetry
npm run lint
```

새 HTTP Source는 정확한 `sourceId` binding과 변경 사유를 추가한다. 새 TLS
예외는 실제 인증 실패를 재현한 증거, exact hostname, 만료일을 포함해야
한다. 정책 오류는 기본값이나 DB 설정으로 fallback하지 않는다.

## 남은 Source별 수집 기술 부채

다음 분기는 transport가 아니라 URL/CMS 의미를 처리하므로 이번 통합에서
유지한다.

- `cau_010`, `cau_011`, `yonsei_060` URL 정규화
- `cau_`, `ewha_`, `uos_` onclick URL 해석
- 일부 Source별 pagination
- `cau_portal`의 중앙대 form/JSON 구조 해석

Linkareer 수집, Supabase ingestion, Slack, 독립 진단/PoC 스크립트의
네트워크 호출은 장학 공고 crawler 실행 파이프라인이 아니며 이 registry의
대상이 아니다.
