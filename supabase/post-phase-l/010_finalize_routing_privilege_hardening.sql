-- Persist the sandbox-verified execute contract for the routed analysis finalizer.
-- Additive and idempotent. Apply manually after migration 009.
begin;

do $$
declare
  target_signature constant text :=
    'public.finalize_notice_analysis_routing(uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,uuid)';
begin
  perform public.post_phase_l_assert_environment();
  if to_regprocedure(target_signature) is null then
    raise exception 'finalize_notice_analysis_routing_signature_missing';
  end if;
end
$$;

revoke execute on function public.finalize_notice_analysis_routing(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.finalize_notice_analysis_routing(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, uuid
) to service_role;

do $$
declare
  target_signature constant text :=
    'public.finalize_notice_analysis_routing(uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,uuid)';
begin
  if has_function_privilege('public', target_signature, 'EXECUTE')
     or has_function_privilege('anon', target_signature, 'EXECUTE')
     or has_function_privilege('authenticated', target_signature, 'EXECUTE')
     or not has_function_privilege('service_role', target_signature, 'EXECUTE') then
    raise exception 'finalize_notice_analysis_routing_privilege_hardening_failed';
  end if;
end
$$;

commit;
