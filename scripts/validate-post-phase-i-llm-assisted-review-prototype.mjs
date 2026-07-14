import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPostPhaseI } from "./build-post-phase-i-llm-assisted-review-prototype.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const invariant = (ok, message) => { if (!ok) throw new Error(message); };
const stable = (value) => JSON.stringify(value);
const containsPath = (value) => /(?:[A-Z]:\\|\/Users\/|\/home\/|\/workspaces\/)/i.test(stable(value));

const first = await buildPostPhaseI();
const second = await buildPostPhaseI();
const risks = JSON.parse(await readFile(resolve(root, "reports/post-phase-master-risk-register.json"), "utf8"));
const m = first.metrics;
const checks = [
  ["deterministic replay", stable(first) === stable(second)], ["bounded evaluation", m.evaluation_case_count <= 15 && m.source_count >= 3], ["schema and evidence links", m.schema_valid_count === m.evaluation_case_count && m.evidence_link_valid_count === m.evaluation_case_count], ["no unsupported claims", m.unsupported_claim_count === 0 && m.hallucinated_field_count === 0], ["human-only decisions", first.evaluation.every((item) => item.output.humanDecisionRequired && !item.output.autoApproveAllowed && !item.output.autoRejectAllowed && !item.output.publicExposureAllowed)], ["zero match excluded", first.excluded_cases.length === 1], ["injection retained as risk", first.evaluation.some((item) => item.input.classification === "prompt_injection" && item.output.recommendation === "parser_fix_required")], ["fail closed provider fallback", m.provider_failure_count === 1 && m.fail_closed_fallback_count === 1], ["no state or exposure mutation", m.public_exposure_change_count === 0 && m.review_state_change_count === 0 && m.automatic_decision_count === 0], ["risk ownership", risks.risks.filter((risk) => risk.status !== "resolved").every((risk) => risk.next_resolution_phase && risk.success_criteria)], ["no absolute paths", !containsPath(first)],
];
const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
invariant(failures.length === 0, `Post-Phase I validation failed: ${failures.join(", ")}`);
const result = { generated_at: first.generated_at, contract_version: "post-phase-i-llm-assisted-review-validation/v1", status: "CONDITIONAL PASS", execution_mode: first.execution_mode, checks: checks.map(([name]) => name), metrics: { ...m, deterministic_replay_match: true, output_schema_valid: true, risk_unassigned_resolution_phase_count: 0 }, safety: { db_write: false, supabase_write: false, migration: false, production_apply: false, crawler_execution: false, public_exposure_mutation: false, automatic_approval: false, external_provider_call: false } };
await writeFile(resolve(root, "reports/post-phase-i-validation-report.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log("Post-Phase I validation CONDITIONAL PASS");
console.log(JSON.stringify(result.metrics, null, 2));
