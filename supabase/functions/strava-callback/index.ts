import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse } from '../_shared/cors.ts';

const REDIRECT_URI_FRAGMENTS = [
  'supabase.co/functions/v1/strava-callback',
];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return new Response(`<html><body><h2>Authorization denied by user.</h2><p>You can close this window.</p></body></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (!code) {
    return corsResponse({ error: 'No authorization code provided.' }, 400);
  }

  const clientId = Deno.env.get('STRAVA_CLIENT_ID');
  const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return corsResponse({ error: 'Strava credentials not configured on server.' }, 500);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const redirectUri = url.origin + url.pathname;

    const tokenRes = await fetch('https://www.strava.com/api/v3/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${clientId}&client_secret=${clientSecret}&code=${code}&grant_type=authorization_code&redirect_uri=${encodeURIComponent(redirectUri)}`,
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.refresh_token) {
      throw new Error(tokenData.message || 'Token exchange failed');
    }

    await supabase.from('strava_connections').upsert({
      user_id: '00000000-0000-0000-0000-000000000001',
      athlete_id: String(tokenData.athlete?.id || 'default'),
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at ? new Date(tokenData.expires_at * 1000).toISOString() : null,
      scope: tokenData.scope || 'activity:read_all',
    }, { onConflict: 'user_id,athlete_id' });

    return new Response(
      `<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d0e12;color:#fff;">
        <h2 style="color:#7c3aed;">Strava Connected!</h2>
        <p>Your Strava account is now linked. The passive engine will auto-sync your activities.</p>
        <p>You can close this window and return to the app.</p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (err) {
    return new Response(
      `<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d0e12;color:#fff;">
        <h2 style="color:#dc3545;">Connection Failed</h2>
        <p>${escapeHtml(String(err))}</p>
        <p>Try again from Settings.</p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
});

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}
