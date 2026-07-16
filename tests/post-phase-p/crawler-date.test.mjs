import assert from "node:assert/strict";
import { parseNoticeDate } from "../../scripts/crawl-scholarship-notices.mjs";

assert.equal(
  parseNoticeDate("UIC Scholarship Application (Jun 16, 2026)")?.toISOString(),
  "2026-06-16T00:00:00.000Z",
);
assert.equal(
  parseNoticeDate("Application deadline 16 June 2026")?.toISOString(),
  "2026-06-16T00:00:00.000Z",
);
assert.equal(
  parseNoticeDate("2026.06.16")?.toISOString(),
  "2026-06-16T00:00:00.000Z",
);
assert.equal(parseNoticeDate("Feb 30, 2026"), null);
assert.equal(parseNoticeDate("no date"), null);

console.log(JSON.stringify({
  passed: true,
  english_month_date_supported: true,
  invalid_calendar_date_rejected: true,
}, null, 2));
