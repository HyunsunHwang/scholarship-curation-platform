import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const cau = JSON.parse(readFileSync('reports/post-phase-m-live/cycle-2/crawler/scholarship-notices-20260716.json', 'utf8')).newNotices.find((item) => item.sourceId === 'cau_001' && /외부장학/u.test(item.title));
const html = readFileSync('/private/tmp/uic-14407.html', 'utf8');
const section = html.match(/<div id="BoardContent">([\s\S]*?)<\/div>\s*<div id="boardicon"/u)?.[1];
if (!cau || !section) throw new Error('persisted_or_acquired_source_missing');
const decode = (value) => value.replace(/<[^>]*>/gu, ' ').replace(/&nbsp;/gu, ' ').replace(/&rsquo;/gu, "'").replace(/&[a-z]+;/giu, ' ').replace(/\s+/gu, ' ').trim();
const yonseiBody = decode(section);
const records = [
  { fixture_id: 'unseen-v341-cau-external-recommendation', source_id: cau.sourceId, article_id: createHash('sha256').update(cau.noticeUrl).digest('hex').slice(0, 16), title: cau.title, body_text: cau.content, published_at: cau.parsedDate, original_url: cau.noticeUrl, acquisition_method: 'persisted_crawler_artifact', acquired_at: null },
  { fixture_id: 'unseen-v341-yonsei-uic-scholarship', source_id: 'yonsei_060', article_id: '14407', title: 'UIC Scholarship Application Announcement: 2026 Fall', body_text: yonseiBody, published_at: '2026-06-16', original_url: 'https://uic.yonsei.ac.kr/main/news.php?mid=m06_01_02&act=view&uid=14407', acquisition_method: 'read_only_http_get_existing_persisted_detail_url', acquired_at: new Date().toISOString() },
].map((record) => ({ ...record, body_sha256: createHash('sha256').update(record.body_text).digest('hex') }));
writeFileSync('fixtures/llm-analysis/unseen-generalization-v341.json', `${JSON.stringify({ version: 'unseen-generalization-v3.4.1', records }, null, 2)}\n`);
console.log(JSON.stringify(records.map(({ fixture_id, source_id, body_text }) => ({ fixture_id, source_id, body_length: body_text.length }))));
