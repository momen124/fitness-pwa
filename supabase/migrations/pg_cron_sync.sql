-- pg_cron: Auto-run passive sync every 3 hours
-- NOTE: Replace the Authorization and apikey values with your actual SUPABASE_ANON_KEY.
-- These must be hardcoded here because pg_cron runs server-side with no env var access.
-- Alternatively, use the Supabase vault or a secret management approach.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('passive-sync-cron') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'passive-sync-cron'
);

-- ⚠️  BEFORE RUNNING: Replace YOUR_SUPABASE_ANON_KEY below with your actual anon key.
--     Do NOT commit the real key to version control.
SELECT cron.schedule(
    'passive-sync-cron',
    '0 */3 * * *',
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/sync-passive',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key', true),
            'apikey', current_setting('app.settings.supabase_anon_key', true),
            'x-user-id', '00000000-0000-0000-0000-000000000001'
        ),
        body := '{}'::jsonb
    );
    $$
);
