import fs from "node:fs";
import path from "node:path";
import {
  classifyOpportunityTags,
  OPPORTUNITY_TAGGING_VERSION,
} from "../lib/opportunity-tagging";

type GoldRow = {
  title: string;
  organization?: string;
  body?: string;
  jobs: string[];
  industries: string[];
};

type Counts = { tp: number; fp: number; fn: number };

function updateCounts(counts: Counts, actual: string[], expected: string[]) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  for (const value of actualSet) {
    if (expectedSet.has(value)) counts.tp += 1;
    else counts.fp += 1;
  }
  for (const value of expectedSet) {
    if (!actualSet.has(value)) counts.fn += 1;
  }
}

function metrics(counts: Counts) {
  return {
    ...counts,
    precision: counts.tp / Math.max(1, counts.tp + counts.fp),
    recall: counts.tp / Math.max(1, counts.tp + counts.fn),
  };
}

const goldPath = path.join("data", "opportunity-tagging-goldset.json");
const gold = JSON.parse(fs.readFileSync(goldPath, "utf8")) as GoldRow[];
const jobCounts: Counts = { tp: 0, fp: 0, fn: 0 };
const industryCounts: Counts = { tp: 0, fp: 0, fn: 0 };
const rows = gold.map((row) => {
  const result = classifyOpportunityTags(row);
  updateCounts(jobCounts, result.jobs, row.jobs);
  updateCounts(industryCounts, result.industries, row.industries);
  return {
    title: row.title,
    expected_jobs: row.jobs,
    actual_jobs: result.jobs,
    expected_industries: row.industries,
    actual_industries: result.industries,
  };
});

const report = {
  generated_at: new Date().toISOString(),
  classifier_version: OPPORTUNITY_TAGGING_VERSION,
  samples: gold.length,
  jobs: metrics(jobCounts),
  industries: metrics(industryCounts),
  rows,
};
const outputPath = path.join("reports", "opportunity-tagging-goldset.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, rows: undefined, report: outputPath }, null, 2));

if (
  report.jobs.precision < 0.75 ||
  report.jobs.recall < 0.7 ||
  report.industries.precision < 0.75 ||
  report.industries.recall < 0.7
) {
  process.exitCode = 1;
}
