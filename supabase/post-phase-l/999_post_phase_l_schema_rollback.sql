-- Destructive only inside the dedicated L project after explicit owner approval.
-- Compatibility baseline tables and the immutable environment guard are preserved.

begin;

do $$
begin
  perform public.post_phase_l_assert_environment();
  if current_setting('post_phase_l.schema_rollback_confirmation', true)
     <> 'ROLLBACK_POST_PHASE_L_SCHEMA' then
    raise exception 'Set post_phase_l.schema_rollback_confirmation before schema rollback';
  end if;
end
$$;

drop function if exists public.post_phase_l_rollback_run(uuid, text);
drop function if exists public.post_phase_l_apply_legacy_review_decision(bigint, text, text, text, bigint);
drop table if exists public.review_evidence_references;
drop table if exists public.review_effective_decisions;
drop table if exists public.review_decision_events;
drop table if exists public.review_items;
drop table if exists public.ingestion_notice_assets;
drop table if exists public.ingestion_notice_revisions;
drop table if exists public.ingestion_notice_occurrences;
drop table if exists public.ingestion_notice_url_aliases;
drop table if exists public.ingestion_notices;
drop table if exists public.ingestion_source_run_results;
drop table if exists public.ingestion_crawl_runs;
drop function if exists public.post_phase_l_sync_effective_decision();
drop function if exists public.post_phase_l_block_immutable_change();
drop function if exists public.post_phase_l_assign_revision_ordinal();
drop function if exists public.post_phase_l_preserve_notice_replay_metadata();
drop function if exists public.post_phase_l_preserve_alias_replay_metadata();
drop function if exists public.post_phase_l_preserve_review_state_on_ingest();

commit;
