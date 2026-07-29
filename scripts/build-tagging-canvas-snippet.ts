import fs from "node:fs";
import { interestJobLabel } from "../lib/interestCategories";
import { interestIndustryLabel } from "../lib/interestIndustries";

const reportPath =
  process.argv[2] ??
  "reports/opportunity-tagging-dry-run-1785303214726.json";
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const summary = JSON.parse(
  fs.readFileSync("reports/opportunity-tagging-summary.json", "utf8")
);

function labelJobs(ids: string[]) {
  return ids
    .map((id) => {
      try {
        return interestJobLabel(id as never);
      } catch {
        return id;
      }
    })
    .join(", ");
}

function labelIndustries(ids: string[]) {
  return ids
    .map((id) => {
      try {
        return interestIndustryLabel(id as never);
      } catch {
        return id;
      }
    })
    .join(", ");
}

function pick(status: string, n = 8) {
  return report.rows
    .filter((row: { status: string }) => row.status === status)
    .slice(0, n)
    .map(
      (row: {
        id: number;
        name: string;
        previous_jobs: string[];
        jobs: string[];
        industries: string[];
        confidence: number;
        changed: boolean;
        evidence?: {
          jobs?: { matched?: string[] }[];
          industries?: { matched?: string[] }[];
        };
      }) => ({
        id: row.id,
        name: row.name.slice(0, 72),
        previousJobs: labelJobs(row.previous_jobs ?? []),
        jobs: labelJobs(row.jobs) || "—",
        industries: labelIndustries(row.industries) || "—",
        confidence: Math.round(row.confidence * 100),
        changed: row.changed,
        reason: (
          row.evidence?.jobs?.[0]?.matched?.[0] ??
          row.evidence?.industries?.[0]?.matched?.[0] ??
          ""
        )
          .replace(/^llm:/, "")
          .replace(/^(title|body|organization|source):/, "")
          .slice(0, 100),
      })
    );
}

const out = {
  meta: summary.meta,
  statusCounts: summary.statusCounts,
  confBuckets: summary.confBuckets,
  topJobs: summary.topJobs.slice(0, 8),
  topIndustries: summary.topIndustries.slice(0, 8),
  samples: {
    auto_tagged: pick("auto_tagged"),
    needs_review: pick("needs_review"),
    not_applicable: pick("not_applicable"),
  },
};

fs.writeFileSync(
  "reports/opportunity-tagging-canvas-snippet.json",
  JSON.stringify(out, null, 2)
);
console.log(
  JSON.stringify(
    {
      statusCounts: out.statusCounts,
      cerebralPalsy: report.rows.find((r: { id: number }) => r.id === 5),
    },
    null,
    2
  )
);
