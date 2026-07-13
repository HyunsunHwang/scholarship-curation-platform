import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_INPUT = "fixtures/integration-foundation/normalized-crawler-sample.json";
const DEFAULT_SOURCES = "data/notice-sources.csv";
const DEFAULT_MAPPING_SNAPSHOT =
  "fixtures/integration-foundation/source-identity-mapping-snapshot.json";
const DEFAULT_OUTPUT = "reports/integration-foundation-source-resolution.json";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function cleanText(value) {
  return String(value ?? "").trim();
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readSourceRowsFromCsv(csvPath) {
  const resolved = path.resolve(csvPath);
  const raw = fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, "");
  const table = parseCsv(raw);
  if (table.length === 0) return [];
  const [header, ...body] = table;
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  if (index.source_id == null) {
    throw new Error(`Missing source_id column in ${resolved}`);
  }

  return body
    .filter((row) => row.some((cell) => cleanText(cell)))
    .map((row) => ({
      source_key: cleanText(row[index.source_id]),
      source_id: cleanText(row[index.source_id]),
      source_name: cleanText(row[index.source_name]),
      university_slug: cleanText(row[index.university_slug]),
      org_unit_id: cleanText(row[index.org_unit_id]),
      source_level: cleanText(row[index.source_level]),
      list_url: cleanText(row[index.list_url]),
      mapping_source: "data/notice-sources.csv",
    }))
    .filter((row) => row.source_key && row.source_id);
}

function readSnapshotRows(snapshotPath) {
  if (!snapshotPath) return [];
  const resolved = path.resolve(snapshotPath);
  if (!fs.existsSync(resolved)) return [];
  const snapshot = readJson(resolved);
  const rows = Array.isArray(snapshot) ? snapshot : snapshot.sources;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    source_key: cleanText(row.source_key ?? row.sourceId ?? row.source_id),
    source_id: cleanText(row.source_id ?? row.sourceId),
    source_name: cleanText(row.source_name ?? row.sourceName),
    university_slug: cleanText(row.university_slug ?? row.universitySlug),
    org_unit_id: cleanText(row.org_unit_id ?? row.orgUnitId),
    source_level: cleanText(row.source_level ?? row.sourceLevel),
    list_url: cleanText(row.list_url ?? row.listUrl),
    mapping_source: cleanText(row.mapping_source) || "mapping-snapshot",
  })).filter((row) => row.source_key && row.source_id);
}

export function extractSourceKeys(input) {
  const records = Array.isArray(input)
    ? input
    : Array.isArray(input.notices)
      ? input.notices
      : Array.isArray(input.sources)
        ? input.sources
        : [];
  const seen = new Set();
  const keys = [];
  for (const record of records) {
    const key = cleanText(record.source_key ?? record.sourceId ?? record.source_id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export function buildSourceIdentityIndex({
  sourceCsvPath = DEFAULT_SOURCES,
  mappingSnapshotPath = DEFAULT_MAPPING_SNAPSHOT,
} = {}) {
  const rows = [
    ...readSourceRowsFromCsv(sourceCsvPath),
    ...readSnapshotRows(mappingSnapshotPath),
  ];
  const byKey = new Map();
  for (const row of rows) {
    const bucket = byKey.get(row.source_key) ?? [];
    bucket.push(row);
    byKey.set(row.source_key, bucket);
  }
  return {
    rows,
    byKey,
    mapping_policy: {
      canonical_db_source_identifier: "notice_sources.source_id",
      crawler_facing_key: "source_key",
      match_rule: "exact source_key/source_id match only",
      no_fuzzy_matching: true,
      no_auto_create: true,
      unresolved_behavior: "blocked",
      ambiguous_behavior: "blocked",
    },
  };
}

export function resolveSourceKey(sourceKey, index) {
  const key = cleanText(sourceKey);
  if (!key) {
    return {
      source_key: key,
      source_id: null,
      resolution_status: "invalid",
      resolution_evidence: { reason: "empty source_key" },
      blocked: true,
    };
  }

  const matches = index.byKey.get(key) ?? [];
  if (matches.length === 0) {
    return {
      source_key: key,
      source_id: null,
      resolution_status: "missing",
      resolution_evidence: { reason: "no exact source_key match" },
      blocked: true,
    };
  }

  const uniqueSourceIds = [...new Set(matches.map((row) => row.source_id))];
  if (uniqueSourceIds.length !== 1) {
    return {
      source_key: key,
      source_id: null,
      resolution_status: "ambiguous",
      resolution_evidence: {
        reason: "multiple source_id candidates for source_key",
        candidates: matches.map((row) => ({
          source_id: row.source_id,
          source_name: row.source_name,
          list_url: row.list_url,
          mapping_source: row.mapping_source,
        })),
      },
      blocked: true,
    };
  }

  const match = matches[0];
  return {
    source_key: key,
    source_id: match.source_id,
    resolution_status: "resolved",
    resolution_evidence: {
      match_rule: "exact",
      source_name: match.source_name,
      university_slug: match.university_slug,
      org_unit_id: match.org_unit_id,
      source_level: match.source_level,
      list_url: match.list_url,
      mapping_source: match.mapping_source,
    },
    blocked: false,
  };
}

export function resolveSourceIdentities(input, options = {}) {
  const index = buildSourceIdentityIndex(options);
  const sourceKeys = Array.isArray(options.sourceKeys)
    ? options.sourceKeys
    : extractSourceKeys(input);
  const resolutions = sourceKeys.map((sourceKey) => resolveSourceKey(sourceKey, index));
  const counts = resolutions.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[`${row.resolution_status}_count`] =
        (acc[`${row.resolution_status}_count`] ?? 0) + 1;
      return acc;
    },
    { total: 0, resolved_count: 0, missing_count: 0, ambiguous_count: 0, invalid_count: 0 },
  );

  return {
    generated_at: options.generatedAt ?? input.generated_at ?? new Date().toISOString(),
    read_only: true,
    db_access: false,
    db_write: false,
    mapping_policy: index.mapping_policy,
    mapping_sources: {
      source_csv: path.resolve(options.sourceCsvPath ?? DEFAULT_SOURCES),
      mapping_snapshot: path.resolve(options.mappingSnapshotPath ?? DEFAULT_MAPPING_SNAPSHOT),
    },
    counts,
    resolutions,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input ?? DEFAULT_INPUT;
  const outputPath = args.output ?? DEFAULT_OUTPUT;
  const input = readJson(inputPath);
  const report = resolveSourceIdentities(input, {
    sourceCsvPath: args.sources ?? DEFAULT_SOURCES,
    mappingSnapshotPath: args["mapping-snapshot"] ?? DEFAULT_MAPPING_SNAPSHOT,
  });
  writeJson(outputPath, report);
  console.log(`source_resolution_report=${path.resolve(outputPath)}`);
  console.log(`resolved=${report.counts.resolved_count}`);
  console.log(`missing=${report.counts.missing_count}`);
  console.log(`ambiguous=${report.counts.ambiguous_count}`);
  console.log(`invalid=${report.counts.invalid_count}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
