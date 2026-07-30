-- Schedule the monthly-reminders edge function to run daily via pg_cron.
-- The function itself only sends emails when it's exactly 7 days before month-end,
-- so calling it daily is safe — it will no-op on all other days.
--
-- SECRETS: the project URL and service-role key are read from Supabase Vault at
-- runtime so no secret is ever committed. Before applying, create them once
-- (SQL editor, values from Dashboard → Settings → API):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');
-- See docs/EMAIL_NOTIFICATIONS.md for the full setup checklist.

create extension if not exists pg_cron;
create extension if not exists pg_net schema extensions;

-- cron.schedule with an existing jobname updates the job in place (idempotent)
select cron.schedule(
  'monthly-volunteer-reminders',
  '0 5 * * *',  -- 08:00 Israel time (UTC+3)
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/monthly-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{}'::jsonb
  )
  $$
);
