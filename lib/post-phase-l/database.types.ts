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
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
