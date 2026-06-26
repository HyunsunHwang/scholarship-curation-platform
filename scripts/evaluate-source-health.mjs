import fs from "node:fs";
import path from "node:path";

const GROUPS = String(process.env.HEALTH_GROUPS ?? "cau,ewha,hanyang,hongik,khu,korea,skku,uos,yonsei")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const HEALTH_LOOKBACK_DAYS = Number(process.env.HEALTH_LOOKBACK_DAYS ?? 7);
const CONSECUTIVE_ERROR_THRESHOLD = Number(process.env.HEALTH_CONSECUTIVE_ERROR_THRESHOLD ?? 3);
const OUTPUT_PATH =
  process.env.HEALTH_OUTPUT_PATH ?? "exports/notices/quality/source-health-latest.json";

function listDatedReports(group) {
  const targetDir = path.resolve("exports/notices", group);
  if (!fs.existsSync(targetDir)) return [];
  return fs
    .readdirSync(targetDir)
    .filter((name) => /^scholarship-notices-\d{8}\.json$/.test(name))
    .sort()
    .slice(-HEALTH_LOOKBACK_DAYS);
}

function readReport(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function toDateFromFileName(fileName) {
  const match = fileName.match(/(\d{8})/);
  return match?.[1] ?? "";
}

function evaluateGroup(group) {
  const files = listDatedReports(group);
  const sourceTrack = new Map();

  for (const fileName of files) {
    const reportPath = path.resolve("exports/notices", group, fileName);
    const report = readReport(reportPath);
    if (!report) continue;
    const date = toDateFromFileName(fileName);
    for (const source of report.perSource ?? []) {
      const key = source.sourceId;
      if (!sourceTrack.has(key)) {
        sourceTrack.set(key, {
          sourceId: source.sourceId,
          sourceName: source.sourceName,
          errorDays: [],
          lastError: "",
          consecutiveErrorDays: 0,
        });
      }
      const record = sourceTrack.get(key);
      if (source.error) {
        record.errorDays.push(date);
        record.lastError = source.error;
      } else {
        record.errorDays.push("");
      }
    }
  }

  const candidates = [];
  for (const record of sourceTrack.values()) {
    let streak = 0;
    for (let i = record.errorDays.length - 1; i >= 0; i -= 1) {
      if (!record.errorDays[i]) break;
      streak += 1;
    }
    record.consecutiveErrorDays = streak;
    if (streak >= CONSECUTIVE_ERROR_THRESHOLD) {
      candidates.push({
        sourceId: record.sourceId,
        sourceName: record.sourceName,
        consecutiveErrorDays: streak,
        lastError: record.lastError,
      });
    }
  }

  candidates.sort((a, b) => b.consecutiveErrorDays - a.consecutiveErrorDays);
  return {
    group,
    reportCount: files.length,
    candidateCount: candidates.length,
    candidates,
  };
}

function run() {
  const perGroup = GROUPS.map((group) => evaluateGroup(group));
  const totalCandidates = perGroup.reduce((sum, group) => sum + group.candidateCount, 0);
  const payload = {
    generatedAt: new Date().toISOString(),
    lookbackDays: HEALTH_LOOKBACK_DAYS,
    threshold: CONSECUTIVE_ERROR_THRESHOLD,
    totalCandidates,
    perGroup,
  };

  const outputPath = path.resolve(OUTPUT_PATH);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");

  console.log(`source_health_output=${outputPath}`);
  console.log(`source_health_candidates=${totalCandidates}`);
  for (const group of perGroup) {
    if (group.candidateCount > 0) {
      console.log(`source_health_group=${group.group} candidates=${group.candidateCount}`);
    }
  }
}

run();
