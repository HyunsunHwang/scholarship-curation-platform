import fs from "node:fs";
import { interestJobLabel } from "../lib/interestCategories";
import { interestIndustryLabel } from "../lib/interestIndustries";

const reportPath =
  process.argv[2] ??
  "reports/opportunity-tagging-dry-run-1785294180491.json";

type Row = {
  id: number;
  name: string;
  content_kind: string;
  previous_jobs: string[];
  jobs: string[];
  previous_industries: string[];
  industries: string[];
  confidence: number;
  status: string;
  changed: boolean;
  evidence?: {
    jobs?: { matched?: string[] }[];
    industries?: { matched?: string[] }[];
  };
};

const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
  generated_at: string;
  classifier_version: string;
  total: number;
  changed: number;
  llm_attempted: number;
  llm_failed: number;
  rows: Row[];
};

const statusCounts: Record<string, number> = {
  auto_tagged: 0,
  needs_review: 0,
  not_applicable: 0,
};
const kindCounts: Record<string, number> = {};
const jobFreq: Record<string, number> = {};
const industryFreq: Record<string, number> = {};
const confBuckets: Record<string, number> = {
  "0.9+": 0,
  "0.8–0.89": 0,
  "0.7–0.79": 0,
  "0.6–0.69": 0,
  "<0.6": 0,
};

for (const row of report.rows) {
  statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
  kindCounts[row.content_kind] = (kindCounts[row.content_kind] ?? 0) + 1;
  for (const job of row.jobs) jobFreq[job] = (jobFreq[job] ?? 0) + 1;
  for (const industry of row.industries) {
    industryFreq[industry] = (industryFreq[industry] ?? 0) + 1;
  }
  const confidence = row.confidence;
  if (confidence >= 0.9) confBuckets["0.9+"] += 1;
  else if (confidence >= 0.8) confBuckets["0.8–0.89"] += 1;
  else if (confidence >= 0.7) confBuckets["0.7–0.79"] += 1;
  else if (confidence >= 0.6) confBuckets["0.6–0.69"] += 1;
  else confBuckets["<0.6"] += 1;
}

function top(map: Record<string, number>, n = 12) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, count]) => ({ id, count }));
}

function reasonOf(row: Row) {
  return (
    row.evidence?.jobs?.[0]?.matched?.[0] ??
    row.evidence?.industries?.[0]?.matched?.[0] ??
    ""
  )
    .replace(/^llm:/, "")
    .slice(0, 100);
}

function sample(status: string, n = 15) {
  return report.rows
    .filter((row) => row.status === status)
    .slice(0, n)
    .map((row) => ({
      id: row.id,
      name: row.name.slice(0, 72),
      kind: row.content_kind,
      previousJobs: row.previous_jobs
        .map((id) => {
          try {
            return interestJobLabel(id as never);
          } catch {
            return id;
          }
        })
        .join(", "),
      jobs: row.jobs
        .map((id) => {
          try {
            return interestJobLabel(id as never);
          } catch {
            return id;
          }
        })
        .join(", "),
      industries: row.industries
        .map((id) => {
          try {
            return interestIndustryLabel(id as never);
          } catch {
            return id;
          }
        })
        .join(", "),
      confidence: Math.round(row.confidence * 100),
      changed: row.changed,
      reason: reasonOf(row),
    }));
}

const out = {
  meta: {
    generated_at: report.generated_at,
    version: report.classifier_version,
    total: report.total,
    changed: report.changed,
    llm_attempted: report.llm_attempted,
    llm_failed: report.llm_failed,
  },
  statusCounts,
  kindCounts,
  confBuckets,
  topJobs: top(jobFreq).map(({ id, count }) => ({
    id,
    count,
    label: (() => {
      try {
        return interestJobLabel(id as never);
      } catch {
        return id;
      }
    })(),
  })),
  topIndustries: top(industryFreq).map(({ id, count }) => ({
    id,
    count,
    label: (() => {
      try {
        return interestIndustryLabel(id as never);
      } catch {
        return id;
      }
    })(),
  })),
  samples: {
    auto_tagged: sample("auto_tagged"),
    needs_review: sample("needs_review"),
    not_applicable: sample("not_applicable"),
  },
};

const outputPath = "reports/opportunity-tagging-summary.json";
fs.writeFileSync(outputPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ...out, samples: undefined }, null, 2));
console.log(`wrote ${outputPath}`);
