# Department Notice Crawler

학과 공지 페이지에서 장학 관련 공지(키워드 기반)만 자동 수집하는 스크립트입니다.

## 1) 입력 파일 준비

`data/notice-sources.csv`에 공지 목록 페이지 정보를 넣습니다.

- 필수 컬럼: `source_id`, `source_name`, `list_url`
- 선택 컬럼:
  - `base_url`: 상대 링크를 절대 링크로 변환할 때 기준 URL
  - `list_item_selector`: 공지 한 건을 감싸는 셀렉터 (예: `.board-list tbody tr`)
  - `link_selector`: 목록 아이템 내부의 상세 링크 셀렉터
  - `title_selector`: 목록 아이템 내부의 제목 셀렉터
  - `date_selector`: 목록 아이템 내부의 날짜 셀렉터
  - `detail_content_selector`: 상세 본문 셀렉터
  - `detail_date_selector`: 상세 날짜 셀렉터
  - `notice_url_pattern`: 상세 URL 필터 정규식
  - `keywords`: `|` 구분 키워드 목록
  - `enabled`: `true/false`

## 2) 로컬 실행

```bash
npm install
npm run crawl:notices
```

인자 지정 실행:

```bash
node scripts/crawl-scholarship-notices.mjs data/notice-sources.csv exports/notices .crawler/scholarship-notice-state.json
```

## 3) 출력

- `exports/notices/scholarship-notices-YYYYMMDD.json`: 실행 리포트 + 신규 공지 목록
- `exports/notices/scholarship-notices-latest.json`: 최신 실행 리포트
- `exports/notices/scholarship-notices-new-YYYYMMDD.csv`: 신규 장학 공지 CSV
- `.crawler/scholarship-notice-state.json`: 중복 방지 상태 파일

## 4) 최근 1개월 제한

기본값으로 최근 31일 이내 공지만 포함합니다.

- 날짜 파싱 소스: `detail_date_selector` > `date_selector` > 제목
- 지원 포맷: `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY/MM/DD`, `YYYY년 M월 D일`
- 날짜가 없는 공지는 기본 제외

환경변수:

- `CRAWL_LOOKBACK_DAYS=31` (기본값)
- `CRAWL_ALLOW_UNDATED=true` (날짜 없는 공지도 포함)
- `CRAWL_SOURCE_CONCURRENCY=1` (소스 병렬 처리 수, 기본 1)
- `CRAWL_SOURCE_ID_PREFIX=ewha_` (`source_id` 접두사로 대상 소스 제한)
- `CRAWL_IGNORE_SEEN=true` (중복 상태 무시하고 matched를 모두 new로 처리)

운영 표준:

- 그룹별 실행 시 반드시 `CRAWL_SOURCE_ID_PREFIX`를 함께 지정해 소스 혼입을 방지합니다.
- 예시:
  - 중앙대: `cau_`
  - 이화여대: `ewha_`
  - 한양대: `hanyang_`
  - 홍익대: `hongik_`
  - 경희대: `khu_`
  - 고려대: `korea_`
  - 성균관대: `skku_`
  - 서울시립대: `uos_`
  - 연세대: `yonsei_`

## 5) 아침 자동 실행 (GitHub Actions)

워크플로 파일:

- Daily 업데이트: `.github/workflows/crawl-scholarship-notices.yml`
- Baseline 전체수집: `.github/workflows/crawl-scholarship-notices-baseline.yml`

Daily 워크플로:

- KST 오전 8시 자동 실행 (`UTC 23:00`)
- 이화/고려/연세를 각각 크롤링 후 정제
- Slack으로 **통합 1개 메시지** 전송
- 결과물은 workflow artifact(`scholarship-notice-daily`)로 업로드
- 수동 실행 시 옵션:
  - `fresh_start=true`: 기존 daily 상태 캐시를 무시하고 시작
  - `ignore_seen=true`: 이번 실행에서 `new` 필터를 건너뛰고 테스트

Baseline 워크플로:

- 수동 실행 + 주 1회 실행(월요일 아침 KST)
- 긴 lookback으로 전체 후보를 재수집
- 결과물은 workflow artifact(`scholarship-notice-baseline`)로 업로드

## 5-1) Supabase 자동 적재 (staging)

통합 CSV가 만들어진 뒤, 신규 공지를 Supabase `crawled_notices` staging 테이블에 적재합니다.

- 스크립트: `scripts/ingest-notices-to-supabase.mjs` (`npm run ingest:notices`)
- 중복 방지: `notice_url` UNIQUE + `upsert(ignoreDuplicates)` → 이미 검수/승격된 행은 **절대 덮어쓰지 않음**
- 적재된 행은 `status='new'` 상태로 들어가며, 어드민 검수 후 `scholarships`로 승격됩니다.

필요한 GitHub Secret (Settings → Secrets and variables → Actions):

- `SUPABASE_URL`: 프로젝트 URL (`https://<ref>.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY`: **Service Role Key**. RLS를 우회하므로 절대 코드/클라이언트에 노출 금지. CI Secret으로만 사용.

로컬 테스트(DB 쓰기 없이 파싱만 확인):

```bash
INGEST_DRY_RUN=true node scripts/ingest-notices-to-supabase.mjs exports/notices/daily/scholarship-notices-daily-latest.csv
```

## 5-2) 어드민 검수 + AI 초안 생성

어드민 메뉴 `수집 공지 검수`(`/admin/crawled-notices`)에서 `status='new'` 공지를 확인하고 장학금으로 승격합니다.

- `검수 후 등록`: 원문 공지 제목/본문/URL을 기반으로 장학금 등록 폼을 미리 채움
- `AI 초안 생성`: 수집된 본문을 LLM에 보내 지원금액, 신청기간, 자격요건, 제출서류 등을 `extracted_draft`에 저장하고 폼 기본값으로 반영
- 최종 등록 시 `scholarships`에 insert하고 원본 `crawled_notices`는 `status='promoted'` + `scholarship_id`로 연결

AI 초안 생성은 OpenAI 호환 `/chat/completions` API를 사용합니다. Vercel 환경변수 또는 로컬 `.env`에 설정하세요.

- `LLM_API_KEY`: 필수. LLM Provider API Key
- `LLM_API_BASE`: 선택. 기본값 `https://api.openai.com/v1`
- `LLM_MODEL`: 선택. 기본값 `gpt-4o-mini`

예시:

```bash
LLM_API_BASE=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

## 6) 운영 팁

- 사이트 부하를 피하려고 상세 페이지 요청 사이에 짧은 지연이 있습니다.
- robots.txt / 사이트 이용약관을 확인하고 허용 범위 내에서만 사용하세요.
- 일부 사이트가 JS 렌더링 기반이면 Playwright 기반 수집기로 확장해야 합니다.

## 7) 품질 평가/회귀 감지

매일 배치 후 품질 평가 스크립트로 주요 지표를 계산합니다.

- 스크립트: `scripts/evaluate-crawl-quality.mjs` (`npm run evaluate:notices`)
- 출력:
  - `exports/notices/quality/quality-snapshot-YYYYMMDD.json`
  - `exports/notices/quality/quality-snapshot-latest.json`
- 핵심 지표:
  - `source_success_rate`
  - `precision_cleaned`
  - `false_positive_rate`
  - `daily_rows` 및 최근 중앙값 대비 급락 여부

환경변수(선택):

- `QUALITY_LOOKBACK_DAYS=7`
- `QUALITY_DAILY_DROP_RATIO=0.5`
- `QUALITY_SUCCESS_DROP_ABS=0.2`
- `QUALITY_CORE_GROUPS=cau,ewha,korea`

## 8) 검수 피드백 루프

검수 결과(`promoted/rejected`, `review_note`)를 정기 집계해 정제 규칙/소스 튜닝에 반영합니다.

- 스크립트: `scripts/summarize-crawled-feedback.mjs` (`npm run feedback:notices`)
- 출력: `exports/notices/quality/review-feedback-latest.json`
- 거절 사유는 `review_note`의 `[tag]` 접두사 기준으로 집계됩니다.
  - 예: `[duplicate]`, `[not_scholarship]`, `[expired]`, `[insufficient_info]`
