import fs from "node:fs";
import path from "node:path";

type Observation = {
  cycle_id: string;
  run_id: string;
  classification: string;
  observed_count: number;
  matched_count: number;
  retry_count: number;
  error_code: string | null;
  body_evidence_count: number;
  asset_evidence_count: number;
};

export type PostPhaseMSourceHealth = {
  source_key: string;
  cohort_role: string;
  health: string;
  final_classification: string;
  stable_across_cycles: boolean;
  observations: Observation[];
};

export function getPostPhaseMOperationsSnapshot() {
  const reportPath = path.join(process.cwd(), "reports/post-phase-m-source-health.json");
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
      generated_at: string;
      cycles_compared: string[];
      sources: PostPhaseMSourceHealth[];
    };
    return { mode: "report-backed" as const, ...report };
  } catch {
    return {
      mode: "unavailable" as const,
      generated_at: null,
      cycles_compared: [],
      sources: [],
    };
  }
}
