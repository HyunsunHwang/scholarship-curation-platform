-- Operator template. Do not execute without replacing the UUID and receiving approval.
-- This removes only an isolated L run and new/unpromoted compatibility rows linked to it.

begin;

select public.post_phase_l_rollback_run(
  '00000000-0000-0000-0000-000000000000'::uuid,
  'ROLLBACK_POST_PHASE_L_RUN'
);

rollback;

-- Rehearsal procedure:
-- 1. Replace the UUID with the approved isolated run ID.
-- 2. Change the final ROLLBACK to COMMIT only for the approved rehearsal.
-- 3. Verify unrelated_table_change_count = 0.
-- 4. Reapply the same idempotent plan and compare fingerprints.
