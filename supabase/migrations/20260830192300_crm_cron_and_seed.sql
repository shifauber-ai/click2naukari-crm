/*
# Click2Naukari CRM — pg_cron scheduler + seed products

## Overview
1. Enables the pg_cron extension (server-side PostgreSQL scheduler).
2. Schedules `process_due_transitions()` to run every minute. This is the
   backend-driven automation that fires RINGING (1 min) and INTERESTED/CALLBACK
   (48h) rotations even when no browser is open, no user is logged in, and the
   laptop is off. pg_cron runs inside the database — it is NOT a browser timer.
3. Seeds four initial products.

## Security
- pg_cron runs as the postgres superuser; the job calls a SECURITY DEFINER
  function, so it operates with elevated privileges regardless of session role.
- No secrets involved.

## Notes
- The job is idempotent: process_due_transitions uses FOR UPDATE SKIP LOCKED
  and atomic PENDING->PROCESSING claims, so overlapping runs never double-assign.
- Re-running this migration is safe (CREATE EXTENSION IF NOT EXISTS, jobs are
  replaced via job_unschedule + schedule).
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('click2naukari-process-transitions');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  PERFORM cron.schedule(
    'click2naukari-process-transitions',
    '* * * * *',
    'SELECT public.process_due_transitions();'
  );
END $$;

INSERT INTO public.products (name, code, is_active) VALUES
  ('Hero Job Pack', 'HERO', true),
  ('SIM Activation', 'SIM', true),
  ('Driver Onboarding', 'DRIVE', true),
  ('Vehicle Finance', 'VEHFIN', true)
ON CONFLICT DO NOTHING;
