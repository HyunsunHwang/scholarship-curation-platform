/**
 * Post newly crawled Linkareer 대외활동 items to Slack (readable Block Kit).
 *
 * Fields (5 only):
 *   1. 카테고리 (대외활동)
 *   2. 주관 기업·기관명
 *   3. 프로그램 이름
 *   4. 활동 혜택
 *   5. 모집 마감일
 *
 * Usage:
 *   node scripts/send-slack-linkareer-activity.mjs
 *   node scripts/send-slack-linkareer-activity.mjs --in exports/linkareer/daily-activity-2026-07-29.json
 *
 * Env:
 *   SLACK_ACTIVITY_WEBHOOK_URL  Incoming webhook for #대외활동-검수 (required to post)
 *   ACTIVITY_JSON_PATH          Default input path override
 *   SLACK_ACTIVITY_CHUNK_SIZE   Items per Slack message (default 5)
 */
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const envPath = ".env.local";
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

loadEnvLocal();

const args = process.argv.slice(2);
function argValue(flag, fallback = null) {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}

const DATE = new Date().toISOString().slice(0, 10);
const webhookUrl = process.env.SLACK_ACTIVITY_WEBHOOK_URL;
const chunkSize = Math.max(
  1,
  Number(argValue("--chunk", process.env.SLACK_ACTIVITY_CHUNK_SIZE ?? "5")) || 5
);
const defaultIn =
  process.env.ACTIVITY_JSON_PATH ??
  path.join("exports", "linkareer", `daily-activity-${DATE}.json`);
const inputPath = path.resolve(argValue("--in", defaultIn));

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function escapeMrkdwn(value) {
  return cleanText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toDate(iso) {
  if (!iso) return null;
  return String(iso).slice(0, 10);
}

function linkareerTotalPrizeLabel(rewardManwon) {
  if (rewardManwon == null || rewardManwon === "") return null;
  const n = Number(rewardManwon);
  if (!Number.isFinite(n) || n <= 0) return null;
  const text = Number.isInteger(n) ? String(n) : String(rewardManwon).trim();
  return `총상금 ${text}만원`;
}

function formatBenefits(item) {
  const raw = Array.isArray(item.benefits) ? item.benefits.filter(Boolean) : [];
  const prize = linkareerTotalPrizeLabel(item.reward_manwon);
  const rest = prize
    ? raw.filter(
        (b) => String(b).trim() !== "상금" && !/^총\s*상금\b/.test(String(b).trim())
      )
    : raw;
  const parts = [...(prize ? [prize] : []), ...rest];
  const extra = cleanText(item.additional_benefit);
  if (extra) parts.push(extra);
  return parts.length ? parts.join(", ") : "—";
}

function loadItems(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const items = Array.isArray(payload) ? payload : payload.items;
  if (!Array.isArray(items)) return [];
  return items.filter((item) => item && (item.title || item.id));
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function itemBlocks(item, index, total) {
  const org = escapeMrkdwn(item.organization_name) || "미상";
  const title = escapeMrkdwn(item.title) || "(제목 없음)";
  const url =
    cleanText(item.url) ||
    (item.id ? `https://linkareer.com/activity/${item.id}` : "");
  const titleLine = url ? `<${url}|${title}>` : `*${title}*`;
  const deadline = toDate(item.recruit_close_at) || "미정";
  const benefits = escapeMrkdwn(formatBenefits(item));

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${index + 1}/${total}*  ${titleLine}`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*카테고리*\n대외활동` },
        { type: "mrkdwn", text: `*마감일*\n${deadline}` },
        { type: "mrkdwn", text: `*주관*\n${org}` },
        { type: "mrkdwn", text: `*혜택*\n${benefits}` },
      ],
    },
    { type: "divider" },
  ];
}

function buildPayloads(items, dateLabel) {
  const total = items.length;
  const fallbackEmpty =
    `링커리어 대외활동 검수 큐 · ${dateLabel}\n오늘 올릴 신규 대외활동이 없습니다.`;

  if (total === 0) {
    return [
      {
        text: fallbackEmpty,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "링커리어 대외활동 검수",
              emoji: true,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `*${dateLabel}*  ·  신규 0건`,
              },
            ],
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "오늘 올릴 신규 대외활동이 없습니다.",
            },
          },
        ],
      },
    ];
  }

  const chunks = chunkArray(items, chunkSize);
  return chunks.map((chunk, chunkIdx) => {
    const start = chunkIdx * chunkSize + 1;
    const end = chunkIdx * chunkSize + chunk.length;
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text:
            chunkIdx === 0
              ? "링커리어 대외활동 검수"
              : `링커리어 대외활동 검수 (${chunkIdx + 1}/${chunks.length})`,
          emoji: true,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*${dateLabel}*  ·  신규 *${total}*건  ·  ${start}–${end}번째`,
          },
        ],
      },
      { type: "divider" },
    ];

    chunk.forEach((item, i) => {
      const globalIndex = chunkIdx * chunkSize + i;
      blocks.push(...itemBlocks(item, globalIndex, total));
    });

    // trailing divider 제거
    if (blocks[blocks.length - 1]?.type === "divider") blocks.pop();

    return {
      text: `링커리어 대외활동 검수 큐 · ${dateLabel} · ${total}건 (${start}–${end})`,
      blocks,
    };
  });
}

async function sendSlack(payload) {
  if (!webhookUrl) {
    console.log("skip=missing_SLACK_ACTIVITY_WEBHOOK_URL");
    console.log("--- payload preview ---");
    console.log(JSON.stringify(payload, null, 2));
    return { skipped: true };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Slack webhook failed: HTTP ${response.status} ${body}`);
  }
  return { skipped: false };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const items = loadItems(inputPath);
  console.log(`input=${inputPath} count=${items.length} chunk=${chunkSize}`);

  const dateLabel =
    path.basename(inputPath).match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? DATE;
  const payloads = buildPayloads(items, dateLabel);

  for (let i = 0; i < payloads.length; i += 1) {
    const result = await sendSlack(payloads[i]);
    console.log(
      `part=${i + 1}/${payloads.length} blocks=${payloads[i].blocks.length} skipped=${Boolean(result.skipped)}`
    );
    if (i < payloads.length - 1) await sleep(400);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
