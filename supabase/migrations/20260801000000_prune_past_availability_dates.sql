-- Monthly server-side prune of past blackout/only dates from volunteers.
-- The dashboards already strip past dates opportunistically when a profile is
-- saved, but volunteers who never re-save accumulate stale dates forever (the
-- reported "shows March dates in April" / "passed blocked dates should delete
-- automatically" issues). This job removes dates from months that have fully
-- passed, keeping current-month dates (the live schedule may reference them).
--
-- NOTE: must be applied to the live Supabase project (pg_cron runs server-side;
-- verify the pg_cron extension is enabled). The UPDATE fires the volunteers
-- updated_at trigger, which is fine now that freshness indicators read the
-- availability_confirmations table instead of updated_at.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Runs on the 1st of every month at 03:30 UTC. cron.schedule with an existing
-- jobname updates the job in place, so re-running this migration is safe.
SELECT cron.schedule(
  'prune-past-availability-dates',
  '30 3 1 * *',
  $$
  UPDATE volunteers
  SET
    blackout_dates = COALESCE(
      (SELECT array_agg(d ORDER BY d) FROM unnest(blackout_dates) AS d
       WHERE d >= to_char(date_trunc('month', now()), 'YYYY-MM-DD')),
      '{}'
    ),
    only_dates = COALESCE(
      (SELECT array_agg(d ORDER BY d) FROM unnest(only_dates) AS d
       WHERE d >= to_char(date_trunc('month', now()), 'YYYY-MM-DD')),
      '{}'
    )
  WHERE
    EXISTS (SELECT 1 FROM unnest(blackout_dates) AS d
            WHERE d < to_char(date_trunc('month', now()), 'YYYY-MM-DD'))
    OR EXISTS (SELECT 1 FROM unnest(only_dates) AS d
               WHERE d < to_char(date_trunc('month', now()), 'YYYY-MM-DD'));
  $$
);
