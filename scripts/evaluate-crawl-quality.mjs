import fs from "node:fs";
import path from "node:path";

const QUALITY_GROUPS = String(
  process.env.QUALITY_GROUPS ?? "cau,ewha,hanyang,hongik,khu,korea,skku,uos,yonsei",
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const QUALITY_DIR = process.env.QUALITY_OUTPUT_DIR ?? "exports/notices/quality";
const QUALITY_LOOKBACK_DAYS = Number(process.env.QUALITY_LOOKBACK_DAYS ?? 7);
const QUALITY_DAILY_DROP_RATIO = Number(process.env.QUALITY_DAILY_DROP_RATIO ?? 0.5);
const QUALITY_SUCCESS_DROP_ABS = Number(process.env.QUALITY_SUCCESS_DROP_ABS ?? 0.2);
const QUALITY_CORE_GROUPS = String(process.env.QUALITY_CORE_GROUPS ?? "cau,ewha,korea")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

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

function countCsvRows(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const table = parseCsv(raw);
  return Math.max(0, table.length - 1);
}

function formatKstDate(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/-/g, "");
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function listSnapshotFiles(qualityDir) {
  if (!fs.existsSync(qualityDir)) return [];
  return fs
    .readdirSync(qualityDir)
    .filter((name) => /^quality-snapshot-\d{8}\.json$/.test(name))
    .sort();
}

function readSnapshotOrNull(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function toPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function evaluateGroup(group) {
  const reportPath = path.resolve(`exports/notices/${group}/scholarship-notices-latest.json`);
  const cleanedPath = path.resolve(`exports/notices/${group}/scholarship-notices-latest.cleaned.csv`);
  const rejectedPath = path.resolve(`exports/notices/${group}/scholarship-notices-latest.rejected.csv`);

  if (!fs.existsSync(reportPath)) {
    return {
      group,
      exists: false,
      metrics: null,
      paths: { reportPath, cleanedPath, rejectedPath },
    };
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const sources = Number(report?.totals?.sourceCount ?? 0);
  const matched = Number(report?.totals?.matchedCount ?? 0);
  const newCount = Number(report?.totals?.newCount ?? 0);
  const crawled = Number(report?.totals?.crawledCount ?? 0);
  const sourceErrors = (report?.perSource ?? []).filter((item) => cleanText(item?.error)).length;
  const sourceSuccessRate = sources > 0 ? (sources - sourceErrors) / sources : 0;
  const cleanedCount = countCsvRows(cleanedPath);
  const rejectedCount = countCsvRows(rejectedPath);
  const candidates = cleanedCount + rejectedCount;
  const precisionCleaned = candidates > 0 ? cleanedCount / candidates : 0;
  const falsePositiveRate = candidates > 0 ? rejectedCount / candidates : 0;
  const coverageRatio = sources > 0 ? (matched > 0 ? matched / sources : 0) : 0;

  return {
    group,
    exists: true,
    paths: { reportPath, cleanedPath, rejectedPath },
    metrics: {
      sources,
      crawled,
      matched,
      newCount,
      cleanedCount,
      rejectedCount,
      sourceErrors,
      sourceSuccessRate,
      precisionCleaned,
      falsePositiveRate,
      coverageRatio,
    },
  };
}

function summarizeGroups(groupReports) {
  const existing = groupReports.filter((item) => item.exists && item.metrics);
  const total = {
    groups: groupReports.length,
    groupsWithData: existing.length,
    sources: existing.reduce((sum, item) => sum + item.metrics.sources, 0),
    crawled: existing.reduce((sum, item) => sum + item.metrics.crawled, 0),
    matched: existing.reduce((sum, item) => sum + item.metrics.matched, 0),
    newCount: existing.reduce((sum, item) => sum + item.metrics.newCount, 0),
    cleanedCount: existing.reduce((sum, item) => sum + item.metrics.cleanedCount, 0),
    rejectedCount: existing.reduce((sum, item) => sum + item.metrics.rejectedCount, 0),
    sourceErrors: existing.reduce((sum, item) => sum + item.metrics.sourceErrors, 0),
  };
  const totalCandidates = total.cleanedCount + total.rejectedCount;
  return {
    ...total,
    sourceSuccessRate: total.sources > 0 ? (total.sources - total.sourceErrors) / total.sources : 0,
    precisionCleaned: totalCandidates > 0 ? total.cleanedCount / totalCandidates : 0,
    falsePositiveRate: totalCandidates > 0 ? total.rejectedCount / totalCandidates : 0,
  };
}

function buildWarnings({
  currentSnapshot,
  previousSnapshots,
  currentDailyRows,
  medianDailyRows,
}) {
  const warnings = [];
  if (medianDailyRows > 0) {
    const dropRatio = currentDailyRows / medianDailyRows;
    if (dropRatio < QUALITY_DAILY_DROP_RATIO) {
      warnings.push(
        `daily_rows_drop current=${currentDailyRows} median=${medianDailyRows.toFixed(1)} ratio=${dropRatio.toFixed(2)}`,
      );
    }
  }

  const previous = previousSnapshots.at(-1);
  if (previous) {
    for (const coreGroup of QUALITY_CORE_GROUPS) {
      const curr = currentSnapshot.perGroup.find((item) => item.group === coreGroup)?.metrics;
      const prev = previous.perGroup.find((item) => item.group === coreGroup)?.metrics;
      if (!curr || !prev) continue;
      const delta = curr.sourceSuccessRate - prev.sourceSuccessRate;
      if (delta <= -QUALITY_SUCCESS_DROP_ABS) {
        warnings.push(
          `source_success_drop group=${coreGroup} prev=${toPercent(prev.sourceSuccessRate)} current=${toPercent(curr.sourceSuccessRate)}`,
        );
      }
    }
  }

  return warnings;
}

function run() {
  const qualityDir = path.resolve(QUALITY_DIR);
  fs.mkdirSync(qualityDir, { recursive: true });

  const today = formatKstDate();
  const perGroup = QUALITY_GROUPS.map((group) => evaluateGroup(group));
  const totals = summarizeGroups(perGroup);
  const dailyCsvPath = path.resolve("exports/notices/daily/scholarship-notices-daily-latest.csv");
  const dailyRows = countCsvRows(dailyCsvPath);
  const snapshotFiles = listSnapshotFiles(qualityDir);
  const previousSnapshots = snapshotFiles
    .map((name) => readSnapshotOrNull(path.join(qualityDir, name)))
    .filter(Boolean)
    .slice(-QUALITY_LOOKBACK_DAYS);
  const medianDailyRows = median(
    previousSnapshots
      .map((snapshot) => Number(snapshot?.dailyRows ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0),
  );

  const snapshot = {
    generatedAt: new Date().toISOString(),
    date: today,
    lookbackDays: QUALITY_LOOKBACK_DAYS,
    thresholds: {
      dailyDropRatio: QUALITY_DAILY_DROP_RATIO,
      successDropAbs: QUALITY_SUCCESS_DROP_ABS,
      coreGroups: QUALITY_CORE_GROUPS,
    },
    dailyRows,
    dailyRowsMedianRecent: medianDailyRows,
    totals,
    perGroup,
    warnings: [],
  };

  const warnings = buildWarnings({
    currentSnapshot: snapshot,
    previousSnapshots,
    currentDailyRows: dailyRows,
    medianDailyRows,
  });
  snapshot.warnings = warnings;

  const datedPath = path.join(qualityDir, `quality-snapshot-${today}.json`);
  const latestPath = path.join(qualityDir, "quality-snapshot-latest.json");
  fs.writeFileSync(datedPath, JSON.stringify(snapshot, null, 2), "utf8");
  fs.writeFileSync(latestPath, JSON.stringify(snapshot, null, 2), "utf8");

  console.log(`quality_snapshot=${datedPath}`);
  console.log(`quality_latest=${latestPath}`);
  console.log(`daily_rows=${dailyRows}`);
  console.log(`median_daily_rows_recent=${medianDailyRows.toFixed(1)}`);
  console.log(`source_success_rate=${toPercent(totals.sourceSuccessRate)}`);
  console.log(`precision_cleaned=${toPercent(totals.precisionCleaned)}`);
  console.log(`false_positive_rate=${toPercent(totals.falsePositiveRate)}`);

  if (warnings.length === 0) {
    console.log("quality_warnings=0");
    return;
  }

  console.log(`quality_warnings=${warnings.length}`);
  for (const warning of warnings) {
    console.log(`quality_warning=${warning}`);
  }
}

run();
