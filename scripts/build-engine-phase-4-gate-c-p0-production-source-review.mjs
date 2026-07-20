import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { productionSourceReview } from "../fixtures/engine-phase-4-gate-c-p0/production-source-review-source.mjs";
import { validateProductionSourceReview } from "../lib/engine-phase-4/gate-c-p0-audit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpus = JSON.parse(fs.readFileSync(path.join(root, "fixtures/engine-phase-4-representative-gold/cases.json"), "utf8"));
const validation = validateProductionSourceReview(corpus, productionSourceReview);
if (!validation.valid) throw new Error(`Invalid production-source review: ${validation.errors.join("; ")}`);
const output = path.join(root, "fixtures/engine-phase-4-gate-c-p0/production-source-review.json");
fs.writeFileSync(output, `${JSON.stringify(productionSourceReview, null, 2)}\n`);
console.log(`reviewed_cases=${productionSourceReview.cases.length}`);
console.log(`concept_slots=${productionSourceReview.cases.length * productionSourceReview.p0_contract.opportunity_field_count}`);
console.log("ENGINE PHASE 4 GATE C P0 PRODUCTION-SOURCE REVIEW BUILDER: PASS");
