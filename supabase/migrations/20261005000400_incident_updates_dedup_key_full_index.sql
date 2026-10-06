-- ── incident_updates: make dedup_key usable by ON CONFLICT ──────────────────
-- incident-updates-sync posts "new fire" notices with
-- `?on_conflict=dedup_key` + ignore-duplicates. The existing unique index is
-- partial (WHERE dedup_key IS NOT NULL), and PostgREST's ON CONFLICT
-- (dedup_key) can't infer a partial index, so every such insert fails with
-- 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
-- specification") — new-fire notices have not been recorded.
--
-- A plain unique index enforces the same rule: NULLs are distinct by
-- default, so rows without a dedup_key never conflict. Build the new index
-- first so uniqueness is never unenforced, then drop the partial one.

create unique index if not exists incident_updates_dedup_key_uniq
  on public.incident_updates(dedup_key);

drop index if exists public.incident_updates_dedup_key_idx;
