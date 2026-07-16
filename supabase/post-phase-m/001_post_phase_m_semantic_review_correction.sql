-- Non-production Post-Phase M patch for append-only correction of a promoted false positive.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

select public.post_phase_l_assert_environment();

do $post_phase_m$
declare
  current_definition text;
  patched_definition text;
  old_guard text := $old$
  if p_decision in ('approve', 'reject', 'needs_review')
     and (legacy_status <> 'new' or legacy_scholarship_id is not null) then
    raise exception 'Only a new, unlinked legacy notice can receive %', p_decision;
  end if;
$old$;
  new_guard text := $new$
  if p_decision in ('approve', 'needs_review')
     and (legacy_status <> 'new' or legacy_scholarship_id is not null) then
    raise exception 'Only a new, unlinked legacy notice can receive %', p_decision;
  end if;
  if p_decision = 'reject'
     and not (
       (legacy_status = 'new' and legacy_scholarship_id is null)
       or (legacy_status = 'promoted' and legacy_scholarship_id is not null)
     ) then
    raise exception 'Only a new unlinked or promoted linked legacy notice can receive reject';
  end if;
$new$;
begin
  select pg_get_functiondef(
    'public.post_phase_l_apply_legacy_review_decision(bigint,text,text,text,bigint)'::regprocedure
  ) into current_definition;

  if position(old_guard in current_definition) = 0 then
    if position(new_guard in current_definition) > 0 then
      return;
    end if;
    raise exception 'Post-Phase M refused to patch an unknown review RPC definition';
  end if;

  patched_definition := replace(current_definition, old_guard, new_guard);
  if patched_definition = current_definition then
    raise exception 'Post-Phase M review RPC guard replacement did not occur';
  end if;
  execute patched_definition;
end
$post_phase_m$;

select
  position(
    'Only a new unlinked or promoted linked legacy notice can receive reject'
    in pg_get_functiondef(
      'public.post_phase_l_apply_legacy_review_decision(bigint,text,text,text,bigint)'::regprocedure
    )
  ) > 0 as promoted_false_positive_reject_enabled,
  has_function_privilege(
    'authenticated',
    'public.post_phase_l_apply_legacy_review_decision(bigint,text,text,text,bigint)',
    'execute'
  ) as authenticated_review_rpc_execute_preserved;

commit;
