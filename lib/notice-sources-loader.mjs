import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { loadNoticeSourceManifestRegistry } from "./notice-source-manifest-loader.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split("|")
    .map((piece) => piece.trim())
    .filter(Boolean);
}

function toBoolean(value, defaultValue = true) {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return defaultValue;
  const lowered = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(lowered)) return true;
  if (["false", "0", "no", "n"].includes(lowered)) return false;
  return defaultValue;
}

function deriveUniversitySlug(sourceId, fallback = "") {
  const normalizedSourceId = cleanText(sourceId).toLowerCase();
  if (normalizedSourceId.includes("_")) return normalizedSourceId.split("_")[0];
  return cleanText(fallback).toLowerCase();
}

function deriveDepartmentName(sourceName, sourceLevel = "department", fallback = "") {
  if (cleanText(sourceLevel).toLowerCase() !== "department") {
    return cleanText(fallback);
  }
  const normalizedFallback = cleanText(fallback);
  if (normalizedFallback) return normalizedFallback;

  const normalizedSourceName = cleanText(sourceName);
  if (!normalizedSourceName) return "";
  const pieces = normalizedSourceName.split(/\s+/);
  if (pieces.length <= 1) return normalizedSourceName;
  return pieces.slice(1).join(" ").trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function resolveSupabaseUrl(env = process.env) {
  const raw = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
  return String(raw)
    .trim()
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");
}

export function loadEnvLocal() {
  const out = {};
  const envPath = path.join(root, ".env.local");
  let text;
  try {
    text = fs.readFileSync(envPath, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let value = t.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function mapRawSource(raw) {
  const sourceId = cleanText(raw.source_id ?? raw.sourceId);
  const sourceName = cleanText(raw.source_name ?? raw.sourceName);
  const sourceLevel = cleanText(raw.source_level ?? raw.sourceLevel) || "department";
  const listUrl = cleanText(raw.list_url ?? raw.listUrl);
  const keywordsRaw = raw.keywords;
  const keywords = Array.isArray(keywordsRaw)
    ? keywordsRaw.map(cleanText).filter(Boolean)
    : parseList(keywordsRaw);

  return {
    sourceId,
    universitySlug: deriveUniversitySlug(
      sourceId,
      raw.university_slug ?? raw.universitySlug,
    ),
    universityId: cleanText(raw.university_id ?? raw.universityId),
    collegeId: cleanText(raw.college_id ?? raw.collegeId),
    departmentId: cleanText(raw.department_id ?? raw.departmentId),
    orgUnitId: cleanText(raw.org_unit_id ?? raw.orgUnitId),
    collegeName: cleanText(raw.college_name ?? raw.collegeName),
    departmentName: deriveDepartmentName(
      sourceName,
      sourceLevel,
      raw.department_name ?? raw.departmentName,
    ),
    sourceLevel,
    sourceName,
    listUrl,
    baseUrl: cleanText(raw.base_url ?? raw.baseUrl),
    listItemSelector: cleanText(raw.list_item_selector ?? raw.listItemSelector),
    linkSelector: cleanText(raw.link_selector ?? raw.linkSelector),
    titleSelector: cleanText(raw.title_selector ?? raw.titleSelector),
    dateSelector: cleanText(raw.date_selector ?? raw.dateSelector),
    detailContentSelector: cleanText(
      raw.detail_content_selector ?? raw.detailContentSelector,
    ),
    detailDateSelector: cleanText(
      raw.detail_date_selector ?? raw.detailDateSelector,
    ),
    noticeUrlPattern: cleanText(
      raw.notice_url_pattern ?? raw.noticeUrlPattern,
    ),
    contentMode: cleanText(raw.content_mode ?? raw.contentMode),
    detailFetchRequired: toBoolean(raw.detail_fetch_required ?? raw.detailFetchRequired, true),
    detailContentAlreadyAvailable: toBoolean(
      raw.detail_content_already_available ?? raw.detailContentAlreadyAvailable,
      false,
    ),
    sectionTitleSelector: cleanText(raw.section_title_selector ?? raw.sectionTitleSelector),
    sectionBodyBoundary: cleanText(raw.section_body_boundary ?? raw.sectionBodyBoundary),
    sectionPublishedDateSelector: cleanText(raw.section_published_date_selector ?? raw.sectionPublishedDateSelector),
    keywords,
    adapter: cleanText(raw.adapter),
    enabled: toBoolean(raw.enabled, true),
  };
}

export function filterStructurallyUsableSources(sources, { includeDisabled = false } = {}) {
  return sources.filter((source) => (
    source.sourceId &&
    source.sourceName &&
    source.listUrl &&
    (includeDisabled || source.enabled)
  ));
}

export function readSourceConfigFromCsv(csvPath, { includeDisabled = false } = {}) {
  const raw = fs.readFileSync(path.resolve(csvPath), "utf8").replace(/^\uFEFF/, "");
  const table = parseCsv(raw);
  if (table.length === 0) {
    throw new Error("Source CSV is empty.");
  }

  const [header, ...body] = table;
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const required = ["source_id", "source_name", "list_url"];
  for (const column of required) {
    if (!(column in index)) {
      throw new Error(`Missing required CSV column: ${column}`);
    }
  }

  const sources = body
    .filter((row) => row.some((cell) => cleanText(cell)))
    .map((row) => {
      const obj = {};
      for (const [name, i] of Object.entries(index)) {
        obj[name] = row[i];
      }
      return mapRawSource(obj);
    });
  return filterStructurallyUsableSources(sources, { includeDisabled });
}

/**
 * Parse crawler input arg:
 *   - "db" | "db:"           → all enabled notice_sources
 *   - "db:ewha"              → university_slug = ewha
 *   - "manifest" | "manifest:" → all enabled Git manifest sources
 *   - "manifest:ewha"         → enabled Git manifest sources for ewha
 *   - path/to/file.csv       → CSV (legacy)
 */
export function parseSourceInput(inputArg) {
  const raw = cleanText(inputArg);
  if (!raw) {
    return { mode: "csv", csvPath: "data/notice-sources.csv", universitySlug: "" };
  }
  const lowered = raw.toLowerCase();
  if (lowered === "db" || lowered === "db:") {
    return { mode: "db", csvPath: "", universitySlug: "" };
  }
  if (lowered.startsWith("db:")) {
    return {
      mode: "db",
      csvPath: "",
      universitySlug: cleanText(raw.slice(3)).toLowerCase(),
    };
  }
  if (lowered === "manifest" || lowered === "manifest:") {
    return { mode: "manifest", csvPath: "", universitySlug: "" };
  }
  if (lowered.startsWith("manifest:")) {
    return {
      mode: "manifest",
      csvPath: "",
      universitySlug: cleanText(raw.slice("manifest:".length)).toLowerCase(),
    };
  }
  return { mode: "csv", csvPath: raw, universitySlug: "" };
}

export async function readSourceConfigFromDb({
  universitySlug = "",
  includeDisabled = false,
  env = process.env,
  createClientFactory = createClient,
} = {}) {
  const fileEnv = loadEnvLocal();
  const merged = { ...fileEnv, ...env };
  const url = resolveSupabaseUrl({
    NEXT_PUBLIC_SUPABASE_URL:
      fileEnv.NEXT_PUBLIC_SUPABASE_URL || merged.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_URL: fileEnv.SUPABASE_URL || merged.SUPABASE_URL,
  });
  const key =
    merged.SUPABASE_SERVICE_ROLE_KEY ||
    fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
    merged.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";

  if (!url || !key) {
    throw new Error(
      "DB source mode requires SUPABASE_URL(or NEXT_PUBLIC_SUPABASE_URL) and a Supabase key.",
    );
  }

  const supabase = createClientFactory(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const pageSize = 1000;
  const rows = [];
  let from = 0;
  while (true) {
    let query = supabase
      .from("notice_sources")
      .select(
        [
          "source_id",
          "university_slug",
          "university_id",
          "college_id",
          "department_id",
          "org_unit_id",
          "college_name",
          "department_name",
          "source_level",
          "source_name",
          "list_url",
          "base_url",
          "list_item_selector",
          "link_selector",
          "title_selector",
          "date_selector",
          "detail_content_selector",
          "detail_date_selector",
          "notice_url_pattern",
          "keywords",
          "adapter",
          "enabled",
        ].join(","),
      )
      .order("source_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (!includeDisabled) query = query.eq("enabled", true);

    if (universitySlug) {
      query = query.eq("university_slug", universitySlug);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`notice_sources load failed: ${error.message}`);
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return filterStructurallyUsableSources(
    rows.map((row) => mapRawSource(row)),
    { includeDisabled },
  );
}

export async function loadSources(inputArg, options = {}) {
  const parsed = parseSourceInput(inputArg);
  if (parsed.mode === "manifest") {
    const manifest = loadNoticeSourceManifestRegistry({
      universitySlug: parsed.universitySlug || options.universitySlug || "",
      rootDirectory: options.manifestRoot,
      includeDisabled: options.includeDisabled === true,
    });
    return {
      mode: "manifest",
      inputLabel: parsed.universitySlug ? `manifest:${parsed.universitySlug}` : "manifest:notice_sources",
      sources: manifest.sources.map((source) => mapRawSource(source)),
      sourceRegistry: manifest.fingerprint,
    };
  }
  if (parsed.mode === "db") {
    const sources = await readSourceConfigFromDb({
      universitySlug: parsed.universitySlug || options.universitySlug || "",
      env: options.env,
      includeDisabled: options.includeDisabled === true,
    });
    return {
      mode: "db",
      inputLabel: parsed.universitySlug
        ? `db:${parsed.universitySlug}`
        : "db:notice_sources",
      sources,
    };
  }

  const sources = readSourceConfigFromCsv(parsed.csvPath, {
    includeDisabled: options.includeDisabled === true,
  });
  return {
    mode: "csv",
    inputLabel: path.resolve(parsed.csvPath),
    sources,
  };
}
