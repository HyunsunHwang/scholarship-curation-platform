import fs from "node:fs";
import { summarizeOperations } from "../lib/analysis/analysis-evaluation.mjs";

const fixtureIndex = process.argv.indexOf("--fixture");
if (process.argv.includes("--db")) throw new Error("database_read_not_enabled_without_explicit_adapter");
const input = fixtureIndex >= 0
  ? JSON.parse(fs.readFileSync(process.argv[fixtureIndex + 1], "utf8"))
  : { jobs: [], runs: [], decisions: [] };
console.log(JSON.stringify(summarizeOperations(input), null, 2));
