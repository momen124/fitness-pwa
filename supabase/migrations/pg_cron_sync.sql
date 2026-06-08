-- pg_cron: Auto-run passive sync every 3 hours

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('passive-sync-cron') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'passive-sync-cron'
);

SELECT cron.schedule(
    'passive-sync-cron',
    '0 */3 * * *',
    $$
    SELECT net.http_post(
        url := 'https://vbfefnljqfcahuhxzfwp.supabase.co/functions/v1/sync-passive',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZiZmVmbmxqcWZjYWh1aHh6ZndwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNTI2MTEsImV4cCI6MjA5NTkyODYxMX0.5T4qT1GUDuWjSBZoCy7ADfmzf8dwVJzIVD4XFKxa-KI',
            'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZiZmVmbmxqcWZjYWh1aHh6ZndwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNTI2MTEsImV4cCI6MjA5NTkyODYxMX0.5T4qT1GUDuWjSBZoCy7ADfmzf8dwVJzIVD4XFKxa-KI',
            'x-user-id', '00000000-0000-0000-0000-000000000001'
        ),
        body := '{}'::jsonb
    );
    $$
);
