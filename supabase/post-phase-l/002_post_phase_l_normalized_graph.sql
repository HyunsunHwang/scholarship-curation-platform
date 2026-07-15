-- Post-Phase L additive normalized ingestion and append-only review graph.
-- Apply only after 001_post_phase_l_compatibility_baseline.sql.

begin;

create table if not exists public.post_phase_l_environment_guard (
  id smallint primary key default 1 check (id = 1),
  project_ref text not null check (project_ref = 'hrayfvdggbhfmmzfblly'),
  environment_kind text not null check (environment_kind = 'non_production'),
  automatic_public_publish_enabled boolean not null default false
    check (automatic_public_publish_enabled = false),
  created_at timestamptz not null default now()
);

insert into public.post_phase_l_environment_guard(
  id,
  project_ref,
  environment_kind,
  automatic_public_publish_enabled
)
values (1, 'hrayfvdggbhfmmzfblly', 'non_production', false)
on conflict (id) do update
set project_ref = excluded.project_ref,
    environment_kind = excluded.environment_kind,
    automatic_public_publish_enabled = false;

create table if not exists public.ingestion_crawl_runs (
  id uuid primary key,
  idempotency_key text not null unique,
  execution_mode text not null check (execution_mode in ('live', 'fixture')),
  runner_version text not null,
  replay_of_run_id uuid references public.ingestion_crawl_runs(id) on delete set null,
  target_project_ref text not null check (target_project_ref = 'hrayfvdggbhfmmzfblly'),
  status text not null check (status in ('succeeded', 'degraded', 'failed', 'rolled_back')),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  source_count integer not null check (source_count > 0),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.ingestion_source_run_results (
  id uuid primary key,
  crawl_run_id uuid not null references public.ingestion_crawl_runs(id) on delete cascade,
  source_id text not null references public.notice_sources(source_id),
  source_key_snapshot text not null,
  result_status text not null check (
    result_status in (
      'success',
      'zero_match_observed',
      'blocked_transport',
      'blocked_parser',
      'blocked_missing_source',
      'blocked_ambiguous_inventory',
      'unresolved'
    )
  ),
  observed_count integer not null default 0 check (observed_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  error_code text,
  error_message text,
  evidence jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (crawl_run_id, source_id),
  check (source_key_snapshot = source_id)
);

create index if not exists ingestion_source_run_results_source_created_idx
  on public.ingestion_source_run_results(source_id, created_at desc);
create index if not exists ingestion_source_run_results_status_idx
  on public.ingestion_source_run_results(result_status, created_at desc);

create table if not exists public.ingestion_notices (
  id uuid primary key,
  source_id text not null references public.notice_sources(source_id),
  identity_kind text not null check (
    identity_kind in ('external_article_id', 'canonical_detail_url')
  ),
  identity_key text not null,
  external_article_id text,
  canonical_url text not null check (canonical_url ~* '^https?://'),
  canonical_url_hash text not null check (canonical_url_hash ~ '^[a-f0-9]{64}$'),
  legacy_crawled_notice_id bigint unique
    references public.crawled_notices(id) on delete set null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (source_id, identity_key),
  check (
    (identity_kind = 'external_article_id' and external_article_id is not null)
    or
    (identity_kind = 'canonical_detail_url' and external_article_id is null)
  )
);

create unique index if not exists ingestion_notices_source_external_id_idx
  on public.ingestion_notices(source_id, external_article_id)
  where external_article_id is not null;
create index if not exists ingestion_notices_source_last_seen_idx
  on public.ingestion_notices(source_id, last_seen_at desc);

create table if not exists public.ingestion_notice_url_aliases (
  id uuid primary key,
  notice_id uuid not null references public.ingestion_notices(id) on delete cascade,
  source_id text not null references public.notice_sources(source_id),
  original_url text not null check (original_url ~* '^https?://'),
  normalized_url text not null check (normalized_url ~* '^https?://'),
  normalized_url_hash text not null check (normalized_url_hash ~ '^[a-f0-9]{64}$'),
  alias_kind text not null check (
    alias_kind in ('original', 'canonical', 'redirect_final', 'alternate')
  ),
  normalization_version text not null,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  unique (source_id, normalized_url_hash)
);

create index if not exists ingestion_notice_url_aliases_notice_idx
  on public.ingestion_notice_url_aliases(notice_id, last_observed_at desc);

create table if not exists public.ingestion_notice_occurrences (
  id uuid primary key,
  notice_id uuid not null references public.ingestion_notices(id) on delete cascade,
  crawl_run_id uuid not null references public.ingestion_crawl_runs(id) on delete cascade,
  source_result_id uuid not null
    references public.ingestion_source_run_results(id) on delete cascade,
  source_id text not null references public.notice_sources(source_id),
  original_url text not null check (original_url ~* '^https?://'),
  canonical_url text not null check (canonical_url ~* '^https?://'),
  final_url text check (final_url is null or final_url ~* '^https?://'),
  observed_url_hash text not null check (observed_url_hash ~ '^[a-f0-9]{64}$'),
  raw_title text not null,
  raw_body text,
  raw_date_text text,
  observed_at timestamptz not null,
  transport_status text not null,
  parser_status text not null,
  provenance jsonb not null default '{}',
  unique (crawl_run_id, source_id, observed_url_hash)
);

create index if not exists ingestion_notice_occurrences_notice_observed_idx
  on public.ingestion_notice_occurrences(notice_id, observed_at desc);
create index if not exists ingestion_notice_occurrences_run_source_idx
  on public.ingestion_notice_occurrences(crawl_run_id, source_id);

create table if not exists public.ingestion_notice_revisions (
  id uuid primary key,
  notice_id uuid not null references public.ingestion_notices(id) on delete cascade,
  occurrence_id uuid not null references public.ingestion_notice_occurrences(id) on delete cascade,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  revision_ordinal integer not null check (revision_ordinal > 0),
  title text not null,
  body text,
  normalized_payload jsonb not null default '{}',
  parser_version text not null,
  body_quality_status text not null,
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (notice_id, content_hash),
  unique (notice_id, revision_ordinal)
);

create index if not exists ingestion_notice_revisions_notice_created_idx
  on public.ingestion_notice_revisions(notice_id, created_at desc);

create or replace function public.post_phase_l_assign_revision_ordinal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Serialize revisions for one notice so concurrent content changes cannot
  -- claim the same ordinal. Content identity remains the deterministic hash.
  perform 1
  from public.ingestion_notices
  where id = new.notice_id
  for update;

  select coalesce(max(r.revision_ordinal), 0) + 1
  into new.revision_ordinal
  from public.ingestion_notice_revisions r
  where r.notice_id = new.notice_id;

  return new;
end;
$$;

drop trigger if exists ingestion_notice_revisions_assign_ordinal
  on public.ingestion_notice_revisions;
create trigger ingestion_notice_revisions_assign_ordinal
before insert on public.ingestion_notice_revisions
for each row execute function public.post_phase_l_assign_revision_ordinal();

create table if not exists public.ingestion_notice_assets (
  id uuid primary key,
  notice_id uuid not null references public.ingestion_notices(id) on delete cascade,
  occurrence_id uuid not null references public.ingestion_notice_occurrences(id) on delete cascade,
  revision_id uuid not null references public.ingestion_notice_revisions(id) on delete cascade,
  original_url text not null check (original_url ~* '^https?://'),
  original_url_hash text not null check (original_url_hash ~ '^[a-f0-9]{64}$'),
  asset_kind text not null,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  storage_reference text,
  verification_status text not null check (
    verification_status in ('metadata_only', 'verified', 'unreachable', 'blocked', 'unknown')
  ),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (occurrence_id, original_url_hash)
);

create index if not exists ingestion_notice_assets_notice_idx
  on public.ingestion_notice_assets(notice_id, created_at desc);

create table if not exists public.review_items (
  id uuid primary key,
  notice_id uuid not null references public.ingestion_notices(id) on delete cascade,
  current_revision_id uuid not null
    references public.ingestion_notice_revisions(id) on delete restrict,
  review_scope text not null,
  state text not null check (state in ('open', 'closed', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notice_id, review_scope)
);

create table if not exists public.review_decision_events (
  id uuid primary key default gen_random_uuid(),
  review_item_id uuid not null references public.review_items(id) on delete cascade,
  revision_id uuid not null references public.ingestion_notice_revisions(id) on delete restrict,
  decision text not null check (
    decision in (
      'approve', 'reject', 'needs_review', 'reopen',
      'request_changes', 'merge_duplicate', 'supersede', 'revoke'
    )
  ),
  reason text,
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_type text not null default 'admin_user' check (actor_type = 'admin_user'),
  event_idempotency_key text not null unique,
  supersedes_event_id uuid references public.review_decision_events(id) on delete restrict,
  crawl_run_id uuid references public.ingestion_crawl_runs(id) on delete restrict,
  source_result_id uuid references public.ingestion_source_run_results(id) on delete restrict,
  intended_projection_action text not null default 'preview_only'
    check (intended_projection_action in ('none', 'preview_only')),
  created_at timestamptz not null default now()
);

create index if not exists review_decision_events_item_created_idx
  on public.review_decision_events(review_item_id, created_at desc, id desc);

create table if not exists public.review_effective_decisions (
  review_item_id uuid primary key references public.review_items(id) on delete cascade,
  decision_event_id uuid not null unique
    references public.review_decision_events(id) on delete cascade,
  decision text not null,
  effective_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists review_effective_decisions_decision_idx
  on public.review_effective_decisions(decision, effective_at desc);

create table if not exists public.review_evidence_references (
  id uuid primary key default gen_random_uuid(),
  decision_event_id uuid not null
    references public.review_decision_events(id) on delete cascade,
  evidence_type text not null check (
    evidence_type in ('occurrence', 'revision', 'asset', 'url_alias', 'source_result')
  ),
  evidence_id uuid not null,
  created_at timestamptz not null default now(),
  unique (decision_event_id, evidence_type, evidence_id)
);

create or replace function public.post_phase_l_preserve_notice_replay_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source_id is distinct from old.source_id
     or new.identity_kind is distinct from old.identity_kind
     or new.identity_key is distinct from old.identity_key then
    raise exception 'Canonical notice identity is immutable';
  end if;
  new.first_seen_at := least(old.first_seen_at, new.first_seen_at);
  new.last_seen_at := greatest(old.last_seen_at, new.last_seen_at);
  new.created_at := old.created_at;
  new.legacy_crawled_notice_id := coalesce(
    new.legacy_crawled_notice_id,
    old.legacy_crawled_notice_id
  );
  return new;
end;
$$;

drop trigger if exists ingestion_notices_preserve_replay_metadata
  on public.ingestion_notices;
create trigger ingestion_notices_preserve_replay_metadata
before update on public.ingestion_notices
for each row execute function public.post_phase_l_preserve_notice_replay_metadata();

create or replace function public.post_phase_l_preserve_alias_replay_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.notice_id is distinct from old.notice_id
     or new.source_id is distinct from old.source_id
     or new.normalized_url_hash is distinct from old.normalized_url_hash then
    raise exception 'Canonical URL alias identity is immutable';
  end if;
  new.first_observed_at := least(old.first_observed_at, new.first_observed_at);
  new.last_observed_at := greatest(old.last_observed_at, new.last_observed_at);
  return new;
end;
$$;

drop trigger if exists ingestion_notice_aliases_preserve_replay_metadata
  on public.ingestion_notice_url_aliases;
create trigger ingestion_notice_aliases_preserve_replay_metadata
before update on public.ingestion_notice_url_aliases
for each row execute function public.post_phase_l_preserve_alias_replay_metadata();

create or replace function public.post_phase_l_preserve_review_state_on_ingest()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('post_phase_l.review_transition', true) = 'on' then
    return new;
  end if;
  new.state := old.state;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists review_items_preserve_state_on_ingest
  on public.review_items;
create trigger review_items_preserve_state_on_ingest
before update on public.review_items
for each row execute function public.post_phase_l_preserve_review_state_on_ingest();

create or replace function public.post_phase_l_block_immutable_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('post_phase_l.internal_write', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception '% is append-only; % is prohibited', tg_table_name, tg_op;
end;
$$;

drop trigger if exists ingestion_crawl_runs_immutable on public.ingestion_crawl_runs;
create trigger ingestion_crawl_runs_immutable
before update or delete on public.ingestion_crawl_runs
for each row execute function public.post_phase_l_block_immutable_change();

drop trigger if exists ingestion_source_run_results_immutable
  on public.ingestion_source_run_results;
create trigger ingestion_source_run_results_immutable
before update or delete on public.ingestion_source_run_results
for each row execute function public.post_phase_l_block_immutable_change();

drop trigger if exists ingestion_notice_occurrences_immutable
  on public.ingestion_notice_occurrences;
create trigger ingestion_notice_occurrences_immutable
before update or delete on public.ingestion_notice_occurrences
for each row execute function public.post_phase_l_block_immutable_change();

drop trigger if exists ingestion_notice_revisions_immutable
  on public.ingestion_notice_revisions;
create trigger ingestion_notice_revisions_immutable
before update or delete on public.ingestion_notice_revisions
for each row execute function public.post_phase_l_block_immutable_change();

drop trigger if exists ingestion_notice_assets_immutable
  on public.ingestion_notice_assets;
create trigger ingestion_notice_assets_immutable
before update or delete on public.ingestion_notice_assets
for each row execute function public.post_phase_l_block_immutable_change();

drop trigger if exists review_decision_events_immutable
  on public.review_decision_events;
create trigger review_decision_events_immutable
before update or delete on public.review_decision_events
for each row execute function public.post_phase_l_block_immutable_change();

drop trigger if exists review_evidence_references_immutable
  on public.review_evidence_references;
create trigger review_evidence_references_immutable
before update or delete on public.review_evidence_references
for each row execute function public.post_phase_l_block_immutable_change();

create or replace function public.post_phase_l_sync_effective_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_event_id uuid;
begin
  select decision_event_id into current_event_id
  from public.review_effective_decisions
  where review_item_id = new.review_item_id
  for update;

  if current_event_id is null and new.supersedes_event_id is not null then
    raise exception 'First review event cannot supersede another event';
  end if;
  if current_event_id is null and new.decision = 'reopen' then
    raise exception 'reopen requires an effective prior event';
  end if;
  if current_event_id is not null and new.supersedes_event_id is distinct from current_event_id then
    raise exception 'Superseding event must reference the current effective event';
  end if;

  perform set_config('post_phase_l.internal_write', 'on', true);
  insert into public.review_effective_decisions(
    review_item_id,
    decision_event_id,
    decision,
    effective_at,
    updated_at
  )
  values (
    new.review_item_id,
    new.id,
    new.decision,
    new.created_at,
    now()
  )
  on conflict (review_item_id) do update
  set decision_event_id = excluded.decision_event_id,
      decision = excluded.decision,
      effective_at = excluded.effective_at,
      updated_at = now();
  perform set_config('post_phase_l.internal_write', 'off', true);
  return new;
end;
$$;

drop trigger if exists review_decision_events_effective_projection
  on public.review_decision_events;
create trigger review_decision_events_effective_projection
after insert on public.review_decision_events
for each row execute function public.post_phase_l_sync_effective_decision();

create or replace function public.post_phase_l_assert_environment()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.post_phase_l_environment_guard
    where id = 1
      and project_ref = 'hrayfvdggbhfmmzfblly'
      and environment_kind = 'non_production'
      and automatic_public_publish_enabled = false
  ) then
    raise exception 'Post-Phase L environment guard is missing or invalid';
  end if;
end;
$$;

create or replace function public.post_phase_l_apply_legacy_review_decision(
  p_legacy_notice_id bigint,
  p_decision text,
  p_reason text,
  p_event_idempotency_key text,
  p_scholarship_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  item public.review_items%rowtype;
  current_event_id uuid;
  event_id uuid;
  event_legacy_notice_id bigint;
  event_decision text;
  source_run_id uuid;
  source_result uuid;
  occurrence_id uuid;
  legacy_status text;
  legacy_scholarship_id bigint;
begin
  perform public.post_phase_l_assert_environment();
  if actor is null or not public.is_admin() then
    raise exception 'Authenticated admin is required';
  end if;
  if p_decision not in ('approve', 'reject', 'needs_review', 'reopen') then
    raise exception 'Unsupported compatibility decision: %', p_decision;
  end if;
  if btrim(coalesce(p_event_idempotency_key, '')) = '' then
    raise exception 'event idempotency key is required';
  end if;

  select status, scholarship_id into legacy_status, legacy_scholarship_id
  from public.crawled_notices
  where id = p_legacy_notice_id
  for update;
  if legacy_status is null then
    raise exception 'Unknown legacy notice %', p_legacy_notice_id;
  end if;
  select ri.* into item
  from public.review_items ri
  join public.ingestion_notices n on n.id = ri.notice_id
  where n.legacy_crawled_notice_id = p_legacy_notice_id
    and ri.review_scope = 'scholarship_notice'
  for update;
  if item.id is null then
    raise exception 'No graph-backed review item for legacy notice %', p_legacy_notice_id;
  end if;

  select e.id, n.legacy_crawled_notice_id, e.decision
  into event_id, event_legacy_notice_id, event_decision
  from public.review_decision_events e
  join public.review_items ri on ri.id = e.review_item_id
  join public.ingestion_notices n on n.id = ri.notice_id
  where e.event_idempotency_key = p_event_idempotency_key;
  if event_id is not null then
    if event_legacy_notice_id is distinct from p_legacy_notice_id
       or event_decision is distinct from p_decision then
      raise exception 'event idempotency key collision';
    end if;
    return jsonb_build_object(
      'event_id', event_id,
      'duplicate', true,
      'decision', p_decision
    );
  end if;

  if p_decision in ('approve', 'reject', 'needs_review')
     and (legacy_status <> 'new' or legacy_scholarship_id is not null) then
    raise exception 'Only a new, unlinked legacy notice can receive %', p_decision;
  end if;
  if p_decision = 'reopen'
     and (legacy_status <> 'rejected' or legacy_scholarship_id is not null) then
    raise exception 'Only a rejected, unlinked legacy notice can be reopened';
  end if;

  select decision_event_id into current_event_id
  from public.review_effective_decisions
  where review_item_id = item.id;

  select o.crawl_run_id, o.source_result_id, o.id
  into source_run_id, source_result, occurrence_id
  from public.ingestion_notice_occurrences o
  where o.notice_id = item.notice_id
  order by o.observed_at desc, o.id desc
  limit 1;

  perform set_config('post_phase_l.review_transition', 'on', true);
  if p_decision = 'approve' then
    if p_scholarship_id is null then
      raise exception 'approve requires scholarship_id';
    end if;
    if not exists (
      select 1 from public.scholarships
      where id = p_scholarship_id
        and is_verified = false
        and list_on_home = false
    ) then
      raise exception 'Approved L scholarship must remain hidden and unverified';
    end if;
  elsif p_scholarship_id is not null then
    raise exception 'Only approve may include scholarship_id';
  end if;

  insert into public.review_decision_events(
    review_item_id,
    revision_id,
    decision,
    reason,
    actor_id,
    actor_type,
    event_idempotency_key,
    supersedes_event_id,
    crawl_run_id,
    source_result_id,
    intended_projection_action
  )
  values (
    item.id,
    item.current_revision_id,
    p_decision,
    nullif(btrim(coalesce(p_reason, '')), ''),
    actor,
    'admin_user',
    p_event_idempotency_key,
    current_event_id,
    source_run_id,
    source_result,
    'preview_only'
  )
  returning id into event_id;

  insert into public.review_evidence_references(
    decision_event_id,
    evidence_type,
    evidence_id
  )
  values (event_id, 'revision', item.current_revision_id)
  on conflict do nothing;
  if occurrence_id is not null then
    insert into public.review_evidence_references(
      decision_event_id,
      evidence_type,
      evidence_id
    )
    values (event_id, 'occurrence', occurrence_id)
    on conflict do nothing;
  end if;
  if source_result is not null then
    insert into public.review_evidence_references(
      decision_event_id,
      evidence_type,
      evidence_id
    )
    values (event_id, 'source_result', source_result)
    on conflict do nothing;
  end if;

  if p_decision = 'approve' then
    update public.crawled_notices
    set status = 'promoted',
        scholarship_id = p_scholarship_id,
        reviewed_at = now(),
        reviewed_by = actor,
        review_note = p_reason
    where id = p_legacy_notice_id;
    update public.review_items set state = 'closed', updated_at = now() where id = item.id;
  elsif p_decision = 'reject' then
    update public.crawled_notices
    set status = 'rejected',
        scholarship_id = null,
        reviewed_at = now(),
        reviewed_by = actor,
        review_note = p_reason
    where id = p_legacy_notice_id;
    update public.review_items set state = 'closed', updated_at = now() where id = item.id;
  elsif p_decision = 'reopen' then
    update public.crawled_notices
    set status = 'new',
        scholarship_id = null,
        reviewed_at = null,
        reviewed_by = null,
        review_note = null
    where id = p_legacy_notice_id;
    update public.review_items set state = 'open', updated_at = now() where id = item.id;
  else
    update public.crawled_notices
    set review_note = p_reason,
        reviewed_at = now(),
        reviewed_by = actor
    where id = p_legacy_notice_id;
    update public.review_items set state = 'open', updated_at = now() where id = item.id;
  end if;
  perform set_config('post_phase_l.review_transition', 'off', true);

  return jsonb_build_object(
    'event_id', event_id,
    'duplicate', false,
    'decision', p_decision,
    'projection_action', 'preview_only'
  );
end;
$$;

create or replace function public.post_phase_l_rollback_run(
  p_run_id uuid,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  notice_ids uuid[];
  deleted_legacy integer := 0;
  deleted_notices integer := 0;
begin
  perform public.post_phase_l_assert_environment();
  if p_confirmation <> 'ROLLBACK_POST_PHASE_L_RUN' then
    raise exception 'Explicit bounded rollback confirmation is required';
  end if;
  if not exists (select 1 from public.ingestion_crawl_runs where id = p_run_id) then
    raise exception 'Unknown Post-Phase L run %', p_run_id;
  end if;

  select coalesce(array_agg(distinct o.notice_id), '{}') into notice_ids
  from public.ingestion_notice_occurrences o
  where o.crawl_run_id = p_run_id
    and not exists (
      select 1 from public.ingestion_notice_occurrences other
      where other.notice_id = o.notice_id and other.crawl_run_id <> p_run_id
    );

  perform set_config('post_phase_l.internal_write', 'on', true);

  delete from public.crawled_notices cn
  using public.ingestion_notices n
  where n.id = any(notice_ids)
    and n.legacy_crawled_notice_id = cn.id
    and cn.status = 'new'
    and cn.scholarship_id is null;
  get diagnostics deleted_legacy = row_count;

  delete from public.review_evidence_references er
  using public.review_decision_events e, public.review_items ri
  where er.decision_event_id = e.id
    and e.review_item_id = ri.id
    and ri.notice_id = any(notice_ids);
  delete from public.review_effective_decisions ed
  using public.review_items ri
  where ed.review_item_id = ri.id and ri.notice_id = any(notice_ids);
  delete from public.review_decision_events e
  using public.review_items ri
  where e.review_item_id = ri.id and ri.notice_id = any(notice_ids);
  delete from public.review_items where notice_id = any(notice_ids);
  delete from public.ingestion_notice_assets where notice_id = any(notice_ids);
  delete from public.ingestion_notice_revisions where notice_id = any(notice_ids);
  delete from public.ingestion_notice_occurrences where crawl_run_id = p_run_id;
  delete from public.ingestion_notice_url_aliases where notice_id = any(notice_ids);
  delete from public.ingestion_source_run_results where crawl_run_id = p_run_id;
  delete from public.ingestion_crawl_runs where id = p_run_id;
  delete from public.ingestion_notices where id = any(notice_ids);
  get diagnostics deleted_notices = row_count;

  perform set_config('post_phase_l.internal_write', 'off', true);
  return jsonb_build_object(
    'run_id', p_run_id,
    'deleted_legacy_rows', deleted_legacy,
    'deleted_graph_notices', deleted_notices,
    'unrelated_table_change_count', 0
  );
end;
$$;

alter table public.post_phase_l_environment_guard enable row level security;
alter table public.ingestion_crawl_runs enable row level security;
alter table public.ingestion_source_run_results enable row level security;
alter table public.ingestion_notices enable row level security;
alter table public.ingestion_notice_url_aliases enable row level security;
alter table public.ingestion_notice_occurrences enable row level security;
alter table public.ingestion_notice_revisions enable row level security;
alter table public.ingestion_notice_assets enable row level security;
alter table public.review_items enable row level security;
alter table public.review_decision_events enable row level security;
alter table public.review_effective_decisions enable row level security;
alter table public.review_evidence_references enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ingestion_crawl_runs',
    'ingestion_source_run_results',
    'ingestion_notices',
    'ingestion_notice_url_aliases',
    'ingestion_notice_occurrences',
    'ingestion_notice_revisions',
    'ingestion_notice_assets',
    'review_items',
    'review_decision_events',
    'review_effective_decisions',
    'review_evidence_references'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_admin_select', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
      table_name || '_admin_select',
      table_name
    );
  end loop;
end
$$;

revoke all on public.post_phase_l_environment_guard from anon, authenticated;
revoke insert, update, delete on public.review_decision_events from anon, authenticated;
revoke insert, update, delete on public.review_evidence_references from anon, authenticated;
revoke all on function public.post_phase_l_rollback_run(uuid, text) from public;
revoke all on function public.post_phase_l_apply_legacy_review_decision(bigint, text, text, text, bigint) from public;
grant select on public.ingestion_crawl_runs, public.ingestion_source_run_results,
  public.ingestion_notices, public.ingestion_notice_url_aliases,
  public.ingestion_notice_occurrences, public.ingestion_notice_revisions,
  public.ingestion_notice_assets, public.review_items,
  public.review_decision_events, public.review_effective_decisions,
  public.review_evidence_references to authenticated;
grant execute on function public.post_phase_l_apply_legacy_review_decision(bigint, text, text, text, bigint)
  to authenticated;
grant execute on function public.post_phase_l_rollback_run(uuid, text) to service_role;
grant all on public.post_phase_l_environment_guard,
  public.ingestion_crawl_runs, public.ingestion_source_run_results,
  public.ingestion_notices, public.ingestion_notice_url_aliases,
  public.ingestion_notice_occurrences, public.ingestion_notice_revisions,
  public.ingestion_notice_assets, public.review_items,
  public.review_decision_events, public.review_effective_decisions,
  public.review_evidence_references to service_role;

commit;
