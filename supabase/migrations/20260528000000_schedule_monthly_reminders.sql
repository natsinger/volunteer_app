-- Schedule the monthly-reminders edge function to run daily via pg_cron.
-- The function itself only sends emails when it's exactly 7 days before month-end,
-- so calling it daily is safe — it will no-op on all other days.
--
-- SECRETS: the project URL and service-role key are read from Supabase Vault at
-- runtime so no secret is ever committed. Before applying, create them once
-- (SQL editor, values from Dashboard → Settings → API):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');

create extension if not exists pg_cron;
create extension if not exists pg_net schema extensions;

-- Fail loudly at apply time if the vault secrets are missing — otherwise the
-- job's url evaluates to NULL and it fails silently in cron.job_run_details
-- every day, and reminders never send.
do $check$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'project_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then
    raise warning 'Vault secrets project_url / service_role_key are missing — the scheduled reminder job will fail until you create them (see header comment).';
  end if;
end
$check$;

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
