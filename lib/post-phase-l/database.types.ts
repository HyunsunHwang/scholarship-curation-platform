import type { Json } from "@/lib/database.types";

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type LIngestionNotice = {
  id: string;
  source_id: string;
  identity_kind: string;
  identity_key: string;
  external_article_id: string | null;
  canonical_url: string;
  canonical_url_hash: string;
  legacy_crawled_notice_id: number | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
};

export type LSourceRunResult = {
  id: string;
  crawl_run_id: string;
  source_id: string;
  source_key_snapshot: string;
  result_status: string;
  observed_count: number;
  matched_count: number;
  retry_count: number;
  error_code: string | null;
  error_message: string | null;
  evidence: Json;
  created_at: string;
};

export type LOccurrence = {
  id: string;
  notice_id: string;
  crawl_run_id: string;
  source_result_id: string;
  source_id: string;
  original_url: string;
  canonical_url: string;
  final_url: string | null;
  observed_url_hash: string;
  raw_title: string;
  raw_body: string | null;
  raw_date_text: string | null;
  observed_at: string;
  transport_status: string;
  parser_status: string;
  provenance: Json;
};

export type LRevision = {
  id: string;
  notice_id: string;
  occurrence_id: string;
  content_hash: string;
  revision_ordinal: number;
  title: string;
  body: string | null;
  normalized_payload: Json;
  parser_version: string;
  body_quality_status: string;
  evidence_fingerprint: string;
  created_at: string;
};

export type LAsset = {
  id: string;
  notice_id: string;
  occurrence_id: string;
  revision_id: string;
  original_url: string;
  original_url_hash: string;
  asset_kind: string;
  mime_type: string | null;
  byte_size: number | null;
  storage_reference: string | null;
  verification_status: string;
  metadata: Json;
  created_at: string;
};

export type LUrlAlias = {
  id: string;
  notice_id: string;
  source_id: string;
  original_url: string;
  normalized_url: string;
  normalized_url_hash: string;
  alias_kind: string;
  normalization_version: string;
  first_observed_at: string;
  last_observed_at: string;
};

export type LReviewItem = {
  id: string;
  notice_id: string;
  current_revision_id: string;
  review_scope: string;
  state: string;
  created_at: string;
  updated_at: string;
};

export type LReviewEvent = {
  id: string;
  review_item_id: string;
  revision_id: string;
  decision: string;
  reason: string | null;
  actor_id: string;
  actor_type: string;
  event_idempotency_key: string;
  supersedes_event_id: string | null;
  crawl_run_id: string | null;
  source_result_id: string | null;
  intended_projection_action: string;
  created_at: string;
};

export type LEffectiveDecision = {
  review_item_id: string;
  decision_event_id: string;
  decision: string;
  effective_at: string;
  updated_at: string;
};

export type LAnalysisJob = {
  id: string;
  notice_id: string;
  revision_id: string;
  status: string;
  priority: number;
  analysis_kind: string;
  provider_policy: string;
  model_policy: string;
  prompt_version: string;
  schema_version: string;
  input_fingerprint: string;
  idempotency_key: string;
  readiness_status: string;
  readiness_reason_codes: Json;
  attempt_count: number;
  max_attempts: number;
  available_at: string;
  leased_at: string | null;
  lease_expires_at: string | null;
  leased_by: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  metadata: Json;
};

export type LAnalysisRun = {
  id: string;
  job_id: string;
  attempt_number: number;
  run_role: string;
  provider: string;
  model: string;
  request_id: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  latency_ms: number | null;
  input_token_count: number | null;
  output_token_count: number | null;
  cached_input_token_count: number | null;
  estimated_cost_micros: number | null;
  currency_code: string;
  prompt_version: string;
  schema_version: string;
  input_fingerprint: string;
  response_fingerprint: string | null;
  validation_status: string;
  error_code: string | null;
  error_message: string | null;
  raw_response_retention_until: string | null;
  raw_response: Json | null;
  metadata: Json;
  created_at: string;
};

export type LAnalysisResult = {
  id: string;
  job_id: string;
  run_id: string;
  notice_id: string;
  revision_id: string;
  result_status: string;
  analysis_schema_version: string;
  structured_result: Json;
  result_fingerprint: string;
  validation_errors: Json;
  confidence_summary: Json;
  requires_human_review: boolean;
  created_at: string;
  superseded_at: string | null;
};

export type LAnalysisEvidence = {
  id: string;
  result_id: string;
  field_path: string;
  evidence_kind: string;
  source_revision_id: string | null;
  source_asset_id: string | null;
  source_locator: string | null;
  quoted_text: string | null;
  normalized_value: Json | null;
  confidence: number | null;
  evidence_fingerprint: string;
  created_at: string;
};

export type LAnalysisReviewEvent = {
  id: string;
  result_id: string;
  notice_id: string;
  revision_id: string;
  reviewer_id: string;
  decision: string;
  original_result_fingerprint: string;
  corrected_output: Json | null;
  effective_output: Json | null;
  correction_fingerprint: string | null;
  reason: string | null;
  event_idempotency_key: string;
  reviewed_at: string;
  created_at: string;
};

export type LScholarshipProgram = {
  id: string;
  canonical_name: string;
  normalized_name: string;
  normalized_organization: string;
  identity_discriminator: string;
  identity_key: string;
  operating_organization: string | null;
  funding_organization: string | null;
  description: string | null;
  status: string;
  created_from_proposal_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LScholarshipProgramAlias = {
  id: string;
  program_id: string;
  alias: string;
  normalized_alias: string;
  alias_kind: string;
  source_proposal_id: string | null;
  created_at: string;
};

export type LScholarshipCycle = {
  id: string;
  program_id: string;
  cycle_label: string;
  cycle_year: number | null;
  academic_term: string | null;
  application_start_at: string | null;
  application_end_at: string | null;
  benefits: Json;
  eligibility: Json;
  target_scope: Json | null;
  required_documents: Json;
  application_method: string | null;
  application_url: string | null;
  source_detail_url: string | null;
  source_notice_id: string;
  source_revision_id: string;
  canonical_status: string;
  publication_status: string;
  idempotency_key: string;
  revision_identity_key: string;
  cycle_identity_key: string | null;
  created_from_proposal_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LAnalysisRoutingDecision = {
  id: string;
  job_id: string;
  economy_run_id: string | null;
  escalation_run_id: string | null;
  selected_run_id: string | null;
  selected_result_id: string | null;
  reason_codes: Json;
  policy_version: string;
  decision_fingerprint: string;
  created_at: string;
};

export type LProgramCycleProposal = {
  id: string;
  analysis_result_id: string;
  analysis_review_event_id: string;
  notice_id: string;
  revision_id: string;
  proposed_program: Json;
  proposed_cycle: Json;
  suggested_existing_program_id: string | null;
  suggested_existing_cycle_id: string | null;
  duplicate_candidates: Json;
  evidence_snapshot: Json;
  source_snapshot: Json;
  confidence: Json;
  proposal_fingerprint: string;
  status: string;
  canonical_program_id: string | null;
  canonical_cycle_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LProposalReviewEvent = {
  id: string;
  proposal_id: string;
  decision: string;
  actor_id: string;
  program_id: string | null;
  cycle_id: string | null;
  program_patch: Json;
  cycle_patch: Json;
  reason: string | null;
  event_idempotency_key: string;
  created_at: string;
};

export type LProjectionLink = {
  id: string;
  cycle_id: string;
  scholarship_id: number;
  source_kind: string;
  projection_status: string;
  projection_fingerprint: string;
  created_at: string;
  updated_at: string;
};

export type LCrawlRun = {
  id: string;
  idempotency_key: string;
  execution_mode: string;
  runner_version: string;
  replay_of_run_id: string | null;
  target_project_ref: string;
  status: string;
  started_at: string;
  finished_at: string;
  source_count: number;
  metadata: Json;
  created_at: string;
};

export interface PostPhaseLDatabase {
  public: {
    Tables: {
      ingestion_crawl_runs: Table<LCrawlRun>;
      ingestion_source_run_results: Table<LSourceRunResult>;
      ingestion_notices: Table<LIngestionNotice>;
      ingestion_notice_url_aliases: Table<LUrlAlias>;
      ingestion_notice_occurrences: Table<LOccurrence>;
      ingestion_notice_revisions: Table<LRevision>;
      ingestion_notice_assets: Table<LAsset>;
      review_items: Table<LReviewItem>;
      review_decision_events: Table<LReviewEvent>;
      review_effective_decisions: Table<LEffectiveDecision>;
      notice_analysis_jobs: Table<LAnalysisJob>;
      notice_analysis_runs: Table<LAnalysisRun>;
      notice_analysis_results: Table<LAnalysisResult>;
      notice_analysis_evidence: Table<LAnalysisEvidence>;
      notice_analysis_review_events: Table<LAnalysisReviewEvent>;
      notice_analysis_routing_decisions: Table<LAnalysisRoutingDecision>;
      scholarship_programs: Table<LScholarshipProgram>;
      scholarship_program_aliases: Table<LScholarshipProgramAlias>;
      scholarship_cycles: Table<LScholarshipCycle>;
      scholarship_program_cycle_proposals: Table<LProgramCycleProposal>;
      scholarship_proposal_review_events: Table<LProposalReviewEvent>;
      scholarship_projection_links: Table<LProjectionLink>;
    };
    Views: { [_ in never]: never };
    Functions: {
      post_phase_l_apply_legacy_review_decision: {
        Args: {
          p_legacy_notice_id: number;
          p_decision: string;
          p_reason: string | null;
          p_event_idempotency_key: string;
          p_scholarship_id?: number | null;
        };
        Returns: Json;
      };
      claim_notice_analysis_jobs: {
        Args: {
          p_worker_id: string;
          p_limit?: number;
          p_lease_seconds?: number;
        };
        Returns: LAnalysisJob[];
      };
      complete_notice_analysis_job: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
        };
        Returns: LAnalysisJob;
      };
      fail_notice_analysis_job: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_error_code: string;
          p_error_message: string;
          p_retryable?: boolean;
          p_retry_delay_seconds?: number;
        };
        Returns: LAnalysisJob;
      };
      claim_notice_analysis_job_by_revision: {
        Args: {
          p_revision_id: string;
          p_worker_id: string;
          p_lease_seconds?: number;
        };
        Returns: LAnalysisJob;
      };
      finalize_notice_analysis_success: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_run: Json;
          p_result: Json;
          p_evidence: Json;
        };
        Returns: Json;
      };
      finalize_notice_analysis_routing: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_economy_run: Json;
          p_economy_result: Json;
          p_economy_evidence: Json;
          p_escalation_run: Json;
          p_escalation_result: Json;
          p_escalation_evidence: Json;
          p_decision: Json;
          p_selected_run_id: string;
          p_selected_result_id: string;
        };
        Returns: Json;
      };
      defer_notice_analysis_job_for_budget: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_reason_codes?: Json;
          p_error_message?: string | null;
          p_estimated_cost_micros?: number | null;
        };
        Returns: LAnalysisJob;
      };
      record_notice_analysis_review: {
        Args: {
          p_result_id: string;
          p_decision: string;
          p_corrected_output: Json | null;
          p_reason: string | null;
          p_event_idempotency_key: string;
        };
        Returns: LAnalysisReviewEvent;
      };
      approve_scholarship_program_cycle_proposal: {
        Args: {
          p_proposal_id: string;
          p_decision: string;
          p_existing_program_id: string | null;
          p_existing_cycle_id: string | null;
          p_program_patch: Json;
          p_cycle_patch: Json;
          p_reason: string | null;
          p_event_idempotency_key: string;
        };
        Returns: Json;
      };
      project_scholarship_cycle: {
        Args: {
          p_cycle_id: string;
          p_projection_fingerprint: string;
        };
        Returns: Json;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
