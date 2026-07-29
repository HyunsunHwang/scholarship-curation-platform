/**
 * Ingest Linkareer crawl JSON into contests OR the admin review queue.
 * Downloads posters / body images / application docs into Supabase Storage.
 *
 * Usage:
 *   node scripts/ingest-linkareer-contests.mjs --in exports/linkareer/contests-2026-07-10.json --limit 5
 *   node scripts/ingest-linkareer-contests.mjs --in ... --to-queue   # crawled_contests (review queue)
 *   node scripts/ingest-linkareer-contests.mjs --in ... --ids 334396,329016
 *   node scripts/ingest-linkareer-contests.mjs --in ... --skip-upload   # DB only, keep remote CDN URLs
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { classifyOpportunityTags } from "../lib/opportunity-tagging.ts";

const BUCKET = "contest-files";
const DOC_TYPE = "지원서 및 안내자료";
const POSTER_TYPE = "포스터";
const THUMB_TYPE = "썸네일";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
function hasFlag(flag) {
  return args.includes(flag);
}

const IN_PATH = argValue("--in", "exports/linkareer/contests-2026-07-10.json");
const KIND_ARG = String(argValue("--kind", "") || "").toLowerCase();
const LIMIT = Number(argValue("--limit", "0")) || 0;
const ONLY_WITH_DOCS = hasFlag("--only-with-docs");
const SKIP_UPLOAD = hasFlag("--skip-upload");
const DRY_RUN = hasFlag("--dry-run");
/** Stage into crawled_contests for admin review instead of publishing to contests. */
const TO_QUEUE = hasFlag("--to-queue");
const IDS = new Set(
  (argValue("--ids", "") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

const VALID_KINDS = new Set(["contest", "education", "activity"]);
const KIND_DEFAULT_NAME = {
  contest: "공모전",
  education: "교육",
  activity: "대외활동",
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function toDate(iso) {
  if (!iso) return null;
  return String(iso).slice(0, 10);
}

/** 링커리어 tenThousandUnitOfReward → "총상금 N만원" (공모전 총상금 소스) */
function linkareerTotalPrizeLabel(rewardManwon) {
  if (rewardManwon == null || rewardManwon === "") return null;
  const n = Number(rewardManwon);
  if (!Number.isFinite(n) || n <= 0) return null;
  const text = Number.isInteger(n) ? String(n) : String(rewardManwon).trim();
  return `총상금 ${text}만원`;
}

/** 혜택 배열에 링커리어 상금을 총상금으로 넣고, 단순 "상금"은 제거 */
function buildBenefitsWithLinkareerPrize(item) {
  const raw = Array.isArray(item.benefits) ? item.benefits.filter(Boolean) : [];
  const prize = linkareerTotalPrizeLabel(item.reward_manwon);
  if (!prize) return raw.length ? raw : null;
  const rest = raw.filter(
    (b) => String(b).trim() !== "상금" && !/^총\s*상금\b/.test(String(b).trim())
  );
  return [prize, ...rest];
}

/** Display name (may include Hangul). */
function displayFileName(name) {
  return String(name || "file")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

/**
 * Supabase Storage object keys must be ASCII-safe.
 * Keep extension; slug the rest.
 */
function storageFileName(name, fallback = "file") {
  const raw = String(name || fallback);
  const extMatch = raw.match(/(\.[a-zA-Z0-9]{1,8})$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : "";
  const stem = ext ? raw.slice(0, -ext.length) : raw;
  const slug = stem
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const base = slug.length >= 2 ? slug : fallback;
  return ext ? `${base}${ext}` : base;
}

function extFromNameOrType(name, contentType) {
  const fromName = path.extname(String(name || "")).toLowerCase();
  if (fromName && fromName.length <= 8) return fromName;
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
  if (ct.includes("png")) return ".png";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("gif")) return ".gif";
  if (ct.includes("pdf")) return ".pdf";
  if (ct.includes("word") || ct.includes("docx")) return ".docx";
  if (ct.includes("sheet") || ct.includes("xlsx")) return ".xlsx";
  if (ct.includes("msword")) return ".doc";
  return "";
}

function extractBodyImages(html) {
  if (!html) return [];
  const out = [];
  const seen = new Set();
  for (const m of String(html).matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    const src = m[1]?.trim();
    if (!src || seen.has(src)) continue;
    if (src.startsWith("data:")) continue;
    seen.add(src);
    out.push(src);
  }
  return out;
}

/** Keep raw body for LLM formatting; only normalize whitespace. */
function lightFormatNotice(title, body) {
  const raw = String(body || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (title?.trim() && !cleaned.startsWith("<") && !cleaned.startsWith("≪")) {
    return `<${title.trim()}>\n\n${cleaned}`;
  }
  return cleaned;
}

function pickPoster(item) {
  const files = item.files || [];
  const poster = files.find((f) => f.type === POSTER_TYPE);
  if (poster?.url) return { url: poster.url, name: poster.filename || "poster.jpg" };
  if (item.thumbnail_url) {
    return { url: item.thumbnail_url, name: "thumbnail.jpg" };
  }
  const thumb = files.find((f) => f.type === THUMB_TYPE);
  if (thumb?.url) return { url: thumb.url, name: thumb.filename || "thumb.jpg" };
  return null;
}

function pickDocs(item) {
  return (item.files || []).filter((f) => f.type === DOC_TYPE && f.url);
}

async function downloadBinary(fileUrl) {
  const res = await fetch(fileUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "*/*",
      Referer: "https://linkareer.com/",
    },
  });
  if (!res.ok) throw new Error(`download HTTP ${res.status} ${fileUrl}`);
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, contentType };
}

async function uploadBuffer(storagePath, buf, contentType) {
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`upload ${storagePath}: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

async function mirrorFile(externalId, folder, sourceUrl, preferredName, index = 0) {
  const displayName = displayFileName(preferredName || "file");
  if (SKIP_UPLOAD) {
    return {
      name: displayName,
      url: sourceUrl,
      source_url: sourceUrl,
      mime_type: null,
      size: null,
    };
  }
  const { buf, contentType } = await downloadBinary(sourceUrl);
  const ext = extFromNameOrType(preferredName, contentType);
  let keyName = storageFileName(preferredName || `${folder}-${index + 1}`, `${folder}-${index + 1}`);
  if (ext && !keyName.toLowerCase().endsWith(ext.toLowerCase())) keyName += ext;
  // Ensure uniqueness when Hangul-only names collapse to the same slug
  const uniqueKey = `${index + 1}-${keyName}`;
  const storagePath = `linkareer/${externalId}/${folder}/${uniqueKey}`;
  const publicUrl = await uploadBuffer(storagePath, buf, contentType);
  return {
    name: displayName.endsWith(ext) || !ext ? displayName : `${displayName}${ext}`,
    url: publicUrl,
    source_url: sourceUrl,
    mime_type: contentType,
    size: buf.length,
  };
}

function buildApplyMethod(item) {
  const types = (item.apply_types || []).filter(Boolean);
  if (types.length) return types.join(", ");
  if (item.apply_url) return "홈페이지 온라인 접수";
  return "홈페이지";
}

async function upsertContest(row) {
  const { data: existing, error: findErr } = await supabase
    .from("contests")
    .select("id")
    .eq("source", row.source)
    .eq("external_id", row.external_id)
    .maybeSingle();
  if (findErr) throw new Error(`lookup: ${findErr.message}`);

  if (existing?.id) {
    // 조회수·스크랩은 Linkareer 값을 반영 (engagement sync와 동일 정책)
    const { data, error } = await supabase
      .from("contests")
      .update(row)
      .eq("id", existing.id)
      .select("id, name, document_files")
      .single();
    if (error) throw new Error(`update: ${error.message}`);
    return { id: data.id, action: "updated", docs: data.document_files?.length ?? 0 };
  }

  const { data, error } = await supabase
    .from("contests")
    .insert(row)
    .select("id, name, document_files")
    .single();
  if (error) throw new Error(`insert: ${error.message}`);
  return { id: data.id, action: "inserted", docs: data.document_files?.length ?? 0 };
}

async function upsertTaggingMetadata(contestId, tagging) {
  const { error } = await supabase.from("contest_tagging_metadata").upsert(
    {
      contest_id: contestId,
      taxonomy_version: tagging.version,
      classifier_version: tagging.version,
      status: tagging.status,
      confidence: tagging.confidence,
      tagging_source: "automatic",
      evidence: tagging.evidence,
      reviewed_at: null,
      reviewed_by: null,
    },
    { onConflict: "contest_id" }
  );
  if (error) throw new Error(`tagging metadata: ${error.message}`);
}

/**
 * Upsert into crawled_contests (review queue).
 * Refreshes media/draft when status is still `new`; only bumps last_seen_at after review.
 */
async function upsertCrawledContest(queueRow) {
  const { data: existing, error: findErr } = await supabase
    .from("crawled_contests")
    .select("id, status")
    .eq("source_group", queueRow.source_group)
    .eq("source_id", queueRow.source_id)
    .maybeSingle();
  if (findErr) throw new Error(`queue lookup: ${findErr.message}`);

  const now = new Date().toISOString();

  if (existing?.id) {
    if (existing.status === "new") {
      const { data, error } = await supabase
        .from("crawled_contests")
        .update({
          ...queueRow,
          last_seen_at: now,
          status: "new",
        })
        .eq("id", existing.id)
        .select("id, document_files")
        .single();
      if (error) throw new Error(`queue update: ${error.message}`);
      return {
        id: data.id,
        action: "queue-updated",
        docs: data.document_files?.length ?? 0,
      };
    }

    const { data, error } = await supabase
      .from("crawled_contests")
      .update({ last_seen_at: now, run_at: queueRow.run_at })
      .eq("id", existing.id)
      .select("id, document_files")
      .single();
    if (error) throw new Error(`queue touch: ${error.message}`);
    return {
      id: data.id,
      action: `queue-seen(${existing.status})`,
      docs: data.document_files?.length ?? 0,
    };
  }

  const { data, error } = await supabase
    .from("crawled_contests")
    .insert({
      ...queueRow,
      status: "new",
      first_seen_at: now,
      last_seen_at: now,
    })
    .select("id, document_files")
    .single();
  if (error) throw new Error(`queue insert: ${error.message}`);
  return {
    id: data.id,
    action: "queue-inserted",
    docs: data.document_files?.length ?? 0,
  };
}

async function ingestOne(item, index, total, contentKind) {
  const externalId = String(item.id);
  process.stdout.write(`[${index + 1}/${total}] ${externalId} ${item.title?.slice(0, 40) || ""} ... `);

  const posterMeta = pickPoster(item);
  // Cap body images — education HTML can embed dozens of assets
  const bodyImgs = extractBodyImages(item.body_html).slice(0, 12);
  const docs = pickDocs(item);

  let posterUrl = posterMeta?.url ?? null;
  let noticeUrls = [...bodyImgs];
  let documentFiles = [];

  if (!DRY_RUN) {
    if (posterMeta?.url) {
      try {
        const mirrored = await mirrorFile(
          externalId,
          "poster",
          posterMeta.url,
          posterMeta.name || "poster.jpg",
          0
        );
        posterUrl = mirrored.url;
      } catch (err) {
        console.warn(`\n  poster warn: ${err.message}`);
      }
    }

    const mirroredNotices = [];
    for (let i = 0; i < bodyImgs.length; i += 1) {
      try {
        const mirrored = await mirrorFile(
          externalId,
          "notice",
          bodyImgs[i],
          `notice-${i + 1}.jpg`,
          i
        );
        mirroredNotices.push(mirrored.url);
      } catch (err) {
        console.warn(`\n  notice img warn: ${err.message}`);
        mirroredNotices.push(bodyImgs[i]);
      }
    }
    noticeUrls = mirroredNotices;

    for (let di = 0; di < docs.length; di += 1) {
      const doc = docs[di];
      try {
        const mirrored = await mirrorFile(
          externalId,
          "docs",
          doc.url,
          doc.filename || "document",
          di
        );
        documentFiles.push(mirrored);
      } catch (err) {
        console.warn(`\n  doc warn ${doc.filename}: ${err.message}`);
        documentFiles.push({
          name: doc.filename || "document",
          url: doc.url,
          source_url: doc.url,
          mime_type: null,
          size: null,
        });
      }
    }
  } else {
    documentFiles = docs.map((d) => ({
      name: d.filename || "document",
      url: d.url,
      source_url: d.url,
      mime_type: null,
      size: null,
    }));
  }

  const noticeText = lightFormatNotice(item.title, item.body_text);
  const tagging = classifyOpportunityTags({
    title: item.title,
    organization: item.organization_name,
    organizationType: item.organization_type,
    body: item.body_text,
    note: item.additional_benefit,
    benefits: item.benefits,
    sourceCategories: item.categories,
    sourceInterests: item.interests,
    contentKind,
  });
  const requiredDocs = documentFiles.map((d) => d.name).filter(Boolean);
  const defaultLabel = KIND_DEFAULT_NAME[contentKind] || "공고";

  const applyEnd = toDate(item.recruit_close_at) || "2099-12-31";
  const name = item.title || `${defaultLabel} ${externalId}`;
  const organization = item.organization_name || "미상";
  const sourceUrl = item.url || `https://linkareer.com/activity/${externalId}`;
  const applyUrl = item.apply_url || item.homepage_url || item.url || "";

  const prizeLabel = linkareerTotalPrizeLabel(item.reward_manwon);
  const benefits = buildBenefitsWithLinkareerPrize(item);

  const extractedDraft = {
    name,
    organization,
    organization_type: item.organization_type || null,
    content_kind: contentKind,
    // 총상금 = 링커리어 tenThousandUnitOfReward 크롤 값 (LLM 합산 아님)
    support_amount_text: prizeLabel,
    selection_count: item.recruit_scale ? Number(item.recruit_scale) || null : null,
    apply_start_date: toDate(item.recruit_start_at),
    apply_end_date: applyEnd,
    announcement_date: null,
    targets: item.targets?.length ? item.targets : null,
    benefits,
    apply_types: item.apply_types?.length ? item.apply_types : null,
    interest_categories: tagging.jobs.length ? tagging.jobs : null,
    interest_industries: tagging.industries.length ? tagging.industries : null,
    tagging: {
      version: tagging.version,
      confidence: tagging.confidence,
      status: tagging.status,
      evidence: tagging.evidence,
    },
    required_documents: requiredDocs,
    apply_method: buildApplyMethod(item),
    apply_url: applyUrl,
    homepage_url: item.homepage_url || item.url || null,
    contact: null,
    note: item.additional_benefit || null,
    selection_note: null,
    poster_image_url: posterUrl,
    original_notice_text: noticeText,
  };

  const row = {
    name,
    organization,
    organization_type: item.organization_type || null,
    content_kind: contentKind,
    support_amount_text: prizeLabel,
    selection_count: extractedDraft.selection_count,
    apply_start_date: extractedDraft.apply_start_date,
    apply_end_date: applyEnd,
    announcement_date: null,
    targets: item.targets?.length ? item.targets : null,
    benefits,
    apply_types: item.apply_types?.length ? item.apply_types : null,
    interest_categories: tagging.jobs.length ? tagging.jobs : null,
    interest_industries: tagging.industries.length ? tagging.industries : null,
    required_documents: requiredDocs,
    document_files: documentFiles,
    apply_method: buildApplyMethod(item),
    apply_url: applyUrl,
    homepage_url: item.homepage_url || item.url || null,
    contact: null,
    note: item.additional_benefit || null,
    selection_note: null,
    poster_image_url: posterUrl,
    original_notice_image_url: noticeUrls[0] || posterUrl || null,
    original_notice_image_urls: noticeUrls.length
      ? noticeUrls
      : posterUrl
        ? [posterUrl]
        : null,
    original_notice_text: noticeText,
    source: "linkareer",
    external_id: externalId,
    source_url: sourceUrl,
    is_verified: true,
    list_on_home: true,
    is_recommended: false,
    recommended_sort_order: null,
    collected_at: new Date().toISOString().slice(0, 10),
  };

  const seedView =
    item.view_count != null && Number.isFinite(Number(item.view_count))
      ? Math.max(0, Math.floor(Number(item.view_count)))
      : null;
  if (seedView != null) {
    row.view_count = seedView;
  }

  const seedScrap =
    item.scrap_count != null && Number.isFinite(Number(item.scrap_count))
      ? Math.max(0, Math.floor(Number(item.scrap_count)))
      : null;
  if (seedScrap != null) {
    row.scrap_count = seedScrap;
  }

  if (!row.apply_url) {
    console.log("SKIP (no apply_url)");
    return { skipped: true };
  }

  if (DRY_RUN) {
    console.log(
      `dry-run ${TO_QUEUE ? "queue" : "publish"} kind=${contentKind} jobs=${tagging.jobs.join(",")} industries=${tagging.industries.join(",")} status=${tagging.status} docs=${documentFiles.length} poster=${!!posterUrl}`
    );
    return { dry: true };
  }

  if (TO_QUEUE) {
    const queueRow = {
      source_group: "linkareer",
      source_id: externalId,
      source_name: organization,
      content_kind: contentKind,
      title: name,
      notice_url: sourceUrl,
      notice_posted_at: toDate(item.recruit_start_at),
      raw_date_text: item.recruit_close_at
        ? `마감 ${toDate(item.recruit_close_at)}`
        : null,
      body: noticeText,
      image_urls: noticeUrls.length
        ? noticeUrls
        : posterUrl
          ? [posterUrl]
          : null,
      poster_image_url: posterUrl,
      document_files: documentFiles,
      extracted_draft: extractedDraft,
      run_at: new Date().toISOString(),
    };
    const result = await upsertCrawledContest(queueRow);
    console.log(
      `${result.action} id=${result.id} kind=${contentKind} docs=${result.docs}`
    );
    return result;
  }

  const result = await upsertContest(row);
  await upsertTaggingMetadata(result.id, tagging);
  console.log(`${result.action} id=${result.id} kind=${contentKind} docs=${result.docs}`);
  return result;
}

async function main() {
  if (!fs.existsSync(IN_PATH)) {
    console.error(`Input not found: ${IN_PATH}`);
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(IN_PATH, "utf8"));
  let items = payload.items || [];
  const contentKindRaw =
    KIND_ARG ||
    payload.kind ||
    items[0]?.content_category ||
    "contest";
  const contentKind = VALID_KINDS.has(contentKindRaw) ? contentKindRaw : "contest";

  if (IDS.size) items = items.filter((x) => IDS.has(String(x.id)));
  if (ONLY_WITH_DOCS) {
    items = items.filter((x) =>
      (x.files || []).some((f) => f.type === DOC_TYPE)
    );
  }
  if (LIMIT > 0) items = items.slice(0, LIMIT);

  console.log(
    `[ingest-linkareer] kind=${contentKind} target=${TO_QUEUE ? "crawled_contests" : "contests"} in=${IN_PATH} count=${items.length} skipUpload=${SKIP_UPLOAD} dryRun=${DRY_RUN}`
  );

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < items.length; i += 1) {
    try {
      await ingestOne(items[i], i, items.length, contentKind);
      ok += 1;
    } catch (err) {
      fail += 1;
      console.log("FAIL", err instanceof Error ? err.message : String(err));
    }
  }
  console.log(`[ingest-linkareer] done kind=${contentKind} ok=${ok} fail=${fail}`);
}

main().catch((err) => {
  console.error("[ingest-linkareer] fatal:", err);
  process.exit(1);
});
