/**
 * HTML table → Markdown preservation smoke test for notice-body-extraction.
 *
 *   node scripts/test-notice-table-markdown.mjs
 */
import assert from "node:assert/strict";
import {
  extractDetailFromHtml,
  htmlTableToMarkdown,
  matrixToMarkdown,
  normalizeBodyText,
  replaceTablesWithMarkdown,
} from "../lib/notice-body-extraction.mjs";
import { load as loadHtml } from "cheerio";

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

test("normalizeBodyText keeps markdown table newlines", () => {
  const input = "| a | b |\n| --- | --- |\n| 1 | 2 |";
  const out = normalizeBodyText(input);
  assert.equal(out.includes("\n"), true);
  assert.equal(out.split("\n").length, 3);
});

test("award-style rowspan/colspan table becomes markdown", () => {
  const html = `
  <div class="board-view-content">
    <p>라. 시상 내역</p>
    <table>
      <tr>
        <th rowspan="2">과제</th>
        <th rowspan="2">훈격</th>
        <th colspan="2">상점</th>
        <th rowspan="2">상금</th>
      </tr>
      <tr>
        <th>학생</th>
        <th>일반</th>
      </tr>
      <tr>
        <td rowspan="3">자유과제</td>
        <td>대상<br/>부총리 겸 과학기술정보통신부 장관상</td>
        <td>1점</td>
        <td>1점</td>
        <td>각 1,000만원</td>
      </tr>
      <tr>
        <td>금상<br/>정보통신산업진흥원 원장상</td>
        <td>1점</td>
        <td>1점</td>
        <td>각 500만원</td>
      </tr>
      <tr>
        <td>은상<br/>개발자대회 조직위원장상</td>
        <td>1점</td>
        <td>1점</td>
        <td>각 250만원</td>
      </tr>
    </table>
    <p>신청 자격과 지원 기간, 제출 서류는 공고문을 확인하세요. 선발 마감 전에 등록해야 합니다.</p>
  </div>`;

  const detail = extractDetailFromHtml(html, {
    baseUrl: "https://example.edu/notice/1",
  });

  assert.match(detail.content, /\| --- \|/);
  assert.match(detail.content, /자유과제/);
  assert.match(detail.content, /각 1,000만원/);
  assert.match(detail.content, /학생/);
  assert.match(detail.content, /일반/);
  // 예전처럼 헤더만 세로로 나열되면 실패해야 함
  assert.equal(
    /^\s*과제\s*$/m.test(detail.content) &&
      /^\s*훈격\s*$/m.test(detail.content) &&
      !detail.content.includes("|"),
    false,
  );
  assert.equal(detail.content.includes("\n"), true);
});

test("presentation/layout tables are skipped", () => {
  const $ = loadHtml(`
    <table role="presentation"><tr><td>메뉴</td><td>본문 긴 문단입니다. ${"가".repeat(80)}</td></tr></table>
    <table>
      <tr><th>구분</th><th>내용</th></tr>
      <tr><td>대상</td><td>재학생</td></tr>
    </table>
  `);
  const converted = replaceTablesWithMarkdown($);
  assert.equal(converted, 1);
  const md = $.root().text();
  assert.match(md, /\| 구분 \| 내용 \|/);
  assert.match(md, /메뉴/);
});

test("matrixToMarkdown requires 2+ columns", () => {
  assert.equal(matrixToMarkdown([["only"]]), "");
  assert.match(matrixToMarkdown([["a", "b"], ["1", "2"]]), /\| a \| b \|/);
});

test("htmlTableToMarkdown returns empty for single-column", () => {
  const $ = loadHtml(`<table><tr><td>one</td></tr><tr><td>two</td></tr></table>`);
  assert.equal(htmlTableToMarkdown($, $("table").get(0)), "");
});

if (!process.exitCode) {
  console.log("all table-markdown tests passed");
}
