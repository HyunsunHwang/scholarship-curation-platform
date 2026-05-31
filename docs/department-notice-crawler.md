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

## 5) 아침 자동 실행 (GitHub Actions)

워크플로 파일:

- Daily 업데이트: `.github/workflows/crawl-scholarship-notices.yml`
- Baseline 전체수집: `.github/workflows/crawl-scholarship-notices-baseline.yml`

Daily 워크플로:

- KST 오전 8시 자동 실행 (`UTC 23:00`)
- 이화/고려를 각각 크롤링 후 정제
- Slack으로 **통합 1개 메시지** 전송
- 결과물은 workflow artifact(`scholarship-notice-daily`)로 업로드

Baseline 워크플로:

- 수동 실행 + 주 1회 실행(월요일 아침 KST)
- 긴 lookback으로 전체 후보를 재수집
- 결과물은 workflow artifact(`scholarship-notice-baseline`)로 업로드

## 6) 운영 팁

- 사이트 부하를 피하려고 상세 페이지 요청 사이에 짧은 지연이 있습니다.
- robots.txt / 사이트 이용약관을 확인하고 허용 범위 내에서만 사용하세요.
- 일부 사이트가 JS 렌더링 기반이면 Playwright 기반 수집기로 확장해야 합니다.
