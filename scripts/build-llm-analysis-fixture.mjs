import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const input = process.argv[2] ?? "/private/tmp/real-data-vertical-slice-third/crawler/scholarship-notices-20260729.json";
const output = process.argv[3] ?? "fixtures/llm-analysis/ewha-real-notices-4.json";
const wanted = new Set(["365411", "365405", "365300", "365911"]);
const artifact = JSON.parse(fs.readFileSync(path.resolve(input), "utf8"));
const notices = artifact.newNotices?.filter((row) => row.sourceId === "ewha_068" && wanted.has(String(new URL(row.noticeUrl).searchParams.get("articleNo"))));
if (!Array.isArray(notices) || notices.length !== 4) throw new Error("expected_exactly_four_ewha_notices");
const records = notices.map((row) => {
  const articleId = new URL(row.noticeUrl).searchParams.get("articleNo");
  const body = String(row.content ?? "").trim();
  if (!articleId || !body || !row.title || !row.dateText) throw new Error(`fixture_record_incomplete:${articleId ?? "unknown"}`);
  return {
    fixture_id: `ewha_068_${articleId}`, source_id: "ewha_068", article_id: articleId,
    title: row.title, published_at: String(row.dateText).replace(/\./g, "-"), original_url: row.noticeUrl,
    body_text: body,
    attachments: (row.attachmentMetadata ?? []).map((item) => ({ name: item.label ?? item.fileName ?? "", url: item.url ?? "" })),
    body_sha256: crypto.createHash("sha256").update(body, "utf8").digest("hex"),
    retrieved_at: artifact.runAt,
    body_quality: { encoding_damage_detected: /\ufffd|(?:Ã.|Â.|â..)/.test(body) },
  };
});
records.sort((a, b) => a.article_id.localeCompare(b.article_id));
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(path.resolve(output), `${JSON.stringify(records, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: path.resolve(output), fixture_count: records.length, provider_calls: 0 }, null, 2));
