import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInitialP0Overlay, validateP0Overlay } from "../lib/engine-phase-4/gate-c-p0-audit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const corpus = read("fixtures/engine-phase-4-representative-gold/cases.json");
const decisions = read("fixtures/engine-phase-4-representative-gold/adjudication/adjudication-decisions.json");
const relativeOutput = "fixtures/engine-phase-4-gate-c-p0/p0-adjudication-overlay.json";
const output = path.join(root, relativeOutput);
const forceInitialize = process.argv.includes("--force-initialize");
const overlay = fs.existsSync(output) && !forceInitialize
  ? read(relativeOutput)
  : buildInitialP0Overlay(corpus, decisions);
const validation = validateP0Overlay(corpus, decisions, overlay);
if (!validation.valid) throw new Error(`P0 overlay validation failed: ${validation.errors.join("; ")}`);
if (!fs.existsSync(output) || forceInitialize) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(overlay, null, 2)}\n`);
}
console.log(`cases=${overlay.cases.length}`);
console.log(`resolved_overlay_fields=${overlay.cases.flatMap((item) => item.fields).filter((item) => item.decision === "resolved").length}`);
console.log("ENGINE PHASE 4 GATE C P0 OVERLAY BUILDER: PASS");
