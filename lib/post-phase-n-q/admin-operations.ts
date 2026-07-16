import fs from "node:fs";
import path from "node:path";

type SourceHealth = {
  source_key: string;
  status: string;
  consecutive_zero_match_count: number;
  public_projection_count: number;
};

type OperationsReport = {
  generated_at: string;
  metrics: {
    recent_crawler_run_count: number;
    source_count: number;
    new_candidate_count: number;
    pending_review_count: number;
    approved_count: number;
    rejected_count: number;
    insufficient_count: number;
    active_public_scholarship_count: number;
    projection_failure_count: number;
    recent_incident_count: number;
  };
  roles: Array<{ role: string; responsibilities: string[] }>;
  recent_incidents: Array<{
    source_key: string;
    status: string;
    severity: string;
  }>;
};

type InvariantReport = {
  generated_at: string;
  passed: boolean;
  alerts: Array<{
    code: string;
    severity: string;
    count: number;
    message: string;
  }>;
};

const REPORT_ROOT = path.join(
  process.cwd(),
  "reports",
  "post-phase-n-q",
);

function readReport<T>(fileName: string): T | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(REPORT_ROOT, fileName), "utf8"),
    ) as T;
  } catch {
    return null;
  }
}

export function getPostPhaseNQOperationsSnapshot() {
  const operations = readReport<OperationsReport>(
    "operations-readiness.json",
  );
  const invariants = readReport<InvariantReport>(
    "nonproduction-invariants.json",
  );
  const health = readReport<{
    generated_at: string;
    sources: SourceHealth[];
  }>("source-health.json");

  if (!operations || !health) {
    return {
      mode: "unavailable" as const,
      generated_at: null,
      metrics: null,
      roles: [],
      recent_incidents: [],
      source_health: [],
      invariants: null,
    };
  }
  return {
    mode: "report-backed" as const,
    generated_at: operations.generated_at,
    metrics: operations.metrics,
    roles: operations.roles,
    recent_incidents: operations.recent_incidents,
    source_health: health.sources,
    invariants,
  };
}
