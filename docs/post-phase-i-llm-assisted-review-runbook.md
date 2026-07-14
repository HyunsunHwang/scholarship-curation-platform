# Post-Phase I Runbook

Run deterministic replay only. Do not set or print provider credentials.

```powershell
node scripts/build-post-phase-i-llm-assisted-review-prototype.mjs
node scripts/validate-post-phase-i-llm-assisted-review-prototype.mjs
```

Expected result: `CONDITIONAL PASS`, no external provider calls, no DB/Supabase write, no automatic decision, and no public exposure change.
