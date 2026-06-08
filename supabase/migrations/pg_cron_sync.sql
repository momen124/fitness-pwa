-- pg_cron: Auto-run passive sync every 3 hours
-- Run this in the Supabase SQL Editor (requires pg_cron extension)

-- 1. Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Schedule the passive sync edge function every 3 hours
-- Note: The edge function is invoked via pg_net or supabase/functions
-- Since pg_cron can call functions directly, we use a simple approach:
-- Schedule an HTTP request to the edge function using pg_net

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing schedule if any
SELECT cron.unschedule('passive-sync-cron') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'passive-sync-cron'
);

-- Schedule: every 3 hours at minute 0
SELECT cron.schedule(
    'passive-sync-cron',
    '0 */3 * * *',
    $$
    SELECT net.http_post(
        url := 'https://vbfefnljqfcahuhxzfwp.supabase.co/functions/v1/sync-passive',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('request.jwt.claims', true)::json->>'role'
        ),
        body := '{}'::jsonb
    );
    $$
);
