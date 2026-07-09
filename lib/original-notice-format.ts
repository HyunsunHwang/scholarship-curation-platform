/**
 * 원문 공고문 형식 계약 (파서 ↔ AI 포맷터 공통).
 *
 * 규칙: 문장·숫자·조건은 유지하고, 줄바꿈·섹션·목록 마커만 정규화한다.
 */

export type NoticeBlock =
  | { kind: "title"; text: string }
  | { kind: "section"; label: string; body: string }
  | { kind: "note"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

/** 가./나./다. 형태 대항목 (아라비아 숫자는 하위 목록으로 취급) */
export const NOTICE_SECTION_RE = /^([가-힣])[.)]\s*(.*)$/;
/** *, ＊ 로 시작하는 주의 문구 (※ 는 섹션 본문 참고로 유지) */
export const NOTICE_NOTE_RE = /^[*＊]\s*(.*)$/;
/** -, ·, •, – 또는 1. 2. 형태 목록 */
export const NOTICE_LIST_RE = /^(?:[-·•–—]\s*(.*)|(\d+)[.)]\s*(.*))$/;
/** <제목> 또는 ≪제목≫ 형태 */
export const NOTICE_TITLE_RE = /^[<\u3008\u300A\uFF1C](.+?)[>\u3009\u300B\uFF1E]\s*$/;

export const ORIGINAL_NOTICE_FORMAT_RULES = `형식 규칙:
1. 제목: 공고 제목이 있으면 한 줄로 <제목> 형태. 이미 비슷한 형태면 유지.
2. 대항목: 지원대상·선발인원·지원금액·활동기간·신청기한·신청방법·기타 등은
   가. 제목 / 나. 제목 / 다. 제목 … (한글 항목 문자 + ". " + 제목) 한 줄.
3. 하위 목록: 번호 목록은 "1. …", 불릿은 "- …" 한 줄씩.
4. 강조 주의(소득분위 무관 등): 줄 맨 앞을 "* " 로 시작.
5. 섹션 안 참고·제외 조건: "※ …" 로 시작.
6. 섹션과 문단 사이에는 빈 줄 1개.
7. 출력은 plain text만. HTML, 마크다운 헤딩(#), 코드펜스, 설명 문구 금지.`;

export const ORIGINAL_NOTICE_FORMAT_SYSTEM_PROMPT = `당신은 한국 장학 공고 원문의 "형식만" 정리하는 도우미입니다.
문장·단어·숫자·날짜·금액·조건·고유명사는 절대 바꾸지 마세요.
줄바꿈, 섹션 구분, 목록 마커만 아래 규칙에 맞게 정규화하세요.
없는 내용을 추가하거나 요약·의역하지 마세요.
원문에 없는 섹션을 만들지 마세요.

${ORIGINAL_NOTICE_FORMAT_RULES}

출력: 정리된 원문 본문만. 앞뒤 설명 금지.`;

export function listItemText(match: RegExpMatchArray): string {
  return (match[1] ?? match[3] ?? "").trim() || match[0];
}

/** 원문 plain text → 표시용 블록 배열 */
export function parseOriginalNoticeText(raw: string): NoticeBlock[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks: NoticeBlock[] = [];
  let i = 0;

  const pushParagraph = (parts: string[]) => {
    const text = parts.join("\n").trim();
    if (text) blocks.push({ kind: "paragraph", text });
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const titleMatch = trimmed.match(NOTICE_TITLE_RE);
    if (titleMatch) {
      blocks.push({ kind: "title", text: titleMatch[1].trim() });
      i += 1;
      continue;
    }

    const noteMatch = trimmed.match(NOTICE_NOTE_RE);
    if (noteMatch) {
      blocks.push({ kind: "note", text: noteMatch[1].trim() || trimmed });
      i += 1;
      continue;
    }

    const sectionMatch = trimmed.match(NOTICE_SECTION_RE);
    if (sectionMatch) {
      const label = `${sectionMatch[1]}. ${sectionMatch[2]}`.trim();
      const bodyLines: string[] = [];
      i += 1;
      while (i < lines.length) {
        const next = lines[i].trim();
        if (!next) {
          const peek = lines.slice(i + 1).find((l) => l.trim());
          if (
            !peek ||
            NOTICE_SECTION_RE.test(peek.trim()) ||
            NOTICE_TITLE_RE.test(peek.trim())
          ) {
            break;
          }
          bodyLines.push("");
          i += 1;
          continue;
        }
        if (
          NOTICE_SECTION_RE.test(next) ||
          NOTICE_TITLE_RE.test(next) ||
          NOTICE_NOTE_RE.test(next)
        ) {
          break;
        }
        bodyLines.push(lines[i]);
        i += 1;
      }
      blocks.push({ kind: "section", label, body: bodyLines.join("\n").trim() });
      continue;
    }

    const listMatch = trimmed.match(NOTICE_LIST_RE);
    if (listMatch) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t) break;
        const m = t.match(NOTICE_LIST_RE);
        if (!m) break;
        items.push(listItemText(m));
        i += 1;
      }
      blocks.push({ kind: "list", items });
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t) break;
      if (
        NOTICE_SECTION_RE.test(t) ||
        NOTICE_TITLE_RE.test(t) ||
        NOTICE_NOTE_RE.test(t) ||
        NOTICE_LIST_RE.test(t)
      ) {
        break;
      }
      para.push(lines[i]);
      i += 1;
    }
    pushParagraph(para);
  }

  return blocks;
}

/** LLM 응답에서 코드펜스·앞뒤 설명 제거 */
export function stripFormattedNoticeOutput(raw: string): string {
  let text = raw.trim();
  const fenced = text.match(/^```(?:\w+)?\s*([\s\S]*?)```$/);
  if (fenced) text = fenced[1].trim();
  // 앞뒤 한 줄짜리 설명성 문장 제거 시도 (본문이 충분히 길 때만)
  const lines = text.split("\n");
  if (lines.length > 3) {
    const first = lines[0].trim();
    if (/^(정리된|포맷|아래는|다음과 같습니다)/.test(first) && !NOTICE_TITLE_RE.test(first) && !NOTICE_SECTION_RE.test(first)) {
      lines.shift();
      while (lines[0]?.trim() === "") lines.shift();
      text = lines.join("\n").trim();
    }
  }
  return text;
}
