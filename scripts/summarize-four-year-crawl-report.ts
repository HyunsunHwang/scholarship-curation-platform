/**
 * Summarize four-year univ crawl report.
 * Usage: npx tsx scripts/summarize-four-year-crawl-report.ts [reportDir]
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? "exports/notices-four-year-univ";
const reportPath = path.join(dir, "scholarship-notices-latest.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const perSource = report.perSource as Array<{
  sourceId: string;
  sourceName: string;
  crawledCount: number;
  matchedCount: number;
  newCount: number;
  finalStatus: string;
  reasonCode?: string;
  errorMessage?: string;
  error?: string;
}>;

const errors = perSource.filter((s) => s.finalStatus !== "success");
const withNew = perSource
  .filter((s) => (s.newCount ?? 0) > 0)
  .sort((a, b) => b.newCount - a.newCount);
const successZero = perSource.filter(
  (s) => s.finalStatus === "success" && (s.crawledCount ?? 0) === 0
);
const successWithItems = perSource.filter(
  (s) => s.finalStatus === "success" && (s.crawledCount ?? 0) > 0
);

const errorBuckets = new Map<string, number>();
for (const s of errors) {
  const key = (s.reasonCode || s.errorMessage || s.error || s.finalStatus || "unknown")
    .toString()
    .split("\n")[0]
    .slice(0, 100);
  errorBuckets.set(key, (errorBuckets.get(key) ?? 0) + 1);
}

const lines: string[] = [];
lines.push("# Four-year university notice crawl summary");
lines.push("");
lines.push(`- Run at: ${report.runAt}`);
lines.push(`- Input: \`${report.input}\``);
lines.push(`- Mode: ${report.sourceMode}`);
lines.push("");
lines.push("## Totals");
lines.push("");
lines.push(`| Metric | Value |`);
lines.push(`|--------|------:|`);
lines.push(`| Sources | ${report.totals.sourceCount} |`);
lines.push(`| Success | ${successWithItems.length + successZero.length} |`);
lines.push(`| Success with list items | ${successWithItems.length} |`);
lines.push(`| Success but 0 items | ${successZero.length} |`);
lines.push(`| Errors | ${errors.length} |`);
lines.push(`| Observed items | ${report.totals.crawledCount} |`);
lines.push(`| Keyword matched | ${report.totals.matchedCount} |`);
lines.push(`| New notices | ${report.totals.newCount} |`);
lines.push(`| Sources with new notices | ${withNew.length} |`);
lines.push("");
lines.push("## Error buckets");
lines.push("");
for (const [k, n] of [...errorBuckets.entries()].sort((a, b) => b[1] - a[1])) {
  lines.push(`- **${n}** — ${k}`);
}
lines.push("");
lines.push("## Top sources by new notices");
lines.push("");
lines.push("| new | crawled | matched | source |");
lines.push("|----:|--------:|--------:|--------|");
for (const s of withNew.slice(0, 20)) {
  lines.push(
    `| ${s.newCount} | ${s.crawledCount} | ${s.matchedCount} | ${s.sourceName} (\`${s.sourceId}\`) |`
  );
}
lines.push("");
lines.push("## Error samples");
lines.push("");
for (const s of errors.slice(0, 30)) {
  const reason = s.reasonCode || s.errorMessage || s.error || s.finalStatus;
  lines.push(`- ${s.sourceName} (\`${s.sourceId}\`): ${reason}`);
}
lines.push("");

const outMd = path.join(dir, "crawl-summary.md");
const outJson = path.join(dir, "crawl-summary.json");
fs.writeFileSync(outMd, lines.join("\n"), "utf8");
fs.writeFileSync(
  outJson,
  JSON.stringify(
    {
      runAt: report.runAt,
      totals: report.totals,
      successWithItems: successWithItems.length,
      successZero: successZero.length,
      errors: errors.length,
      sourcesWithNew: withNew.length,
      errorBuckets: Object.fromEntries(errorBuckets),
      topNew: withNew.slice(0, 20),
      errorSamples: errors.slice(0, 40).map((s) => ({
        sourceId: s.sourceId,
        sourceName: s.sourceName,
        reasonCode: s.reasonCode,
        errorMessage: s.errorMessage ?? s.error ?? null,
        finalStatus: s.finalStatus,
      })),
    },
    null,
    2
  ),
  "utf8"
);

console.log(lines.join("\n"));
console.log(`\nWrote ${outMd}`);
console.log(`Wrote ${outJson}`);
