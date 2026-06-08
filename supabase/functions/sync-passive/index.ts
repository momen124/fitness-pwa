import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsResponse,
  num,
  calculateHeatRisk,
  normalizeExternalActivity,
} from '../_shared/cors.ts';

const ALEXANDRIA_LAT = 31.2001;
const ALEXANDRIA_LON = 29.9187;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let dailyLog: Record<string, unknown> = {
      cardioStart: '00:00',
      cardioDuration: 0,
      stravaEffort: 0,
      weatherTempC: 0,
      weatherHumidity: 0,
      weatherWindSpeed: 0,
      weatherCondition: '',
      heatRisk: 'unknown',
      totalCalories: 0,
      proteinG: 0,
      carbsG: 0,
      fatsG: 0,
      importedActivities: [],
      syncedAt: new Date().toISOString(),
    };

    // 1. Weather
    const weatherKey = Deno.env.get('OPENWEATHER_API_KEY');
    if (weatherKey) {
      try {
        const wxRes = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${ALEXANDRIA_LAT}&lon=${ALEXANDRIA_LON}&appid=${weatherKey}&units=metric`
        );
        const wxData = await wxRes.json();
        if (wxData.main) {
          dailyLog.weatherTempC = Math.round(wxData.main.temp * 10) / 10;
          dailyLog.weatherHumidity = wxData.main.humidity;
          dailyLog.weatherWindSpeed = wxData.wind?.speed || 0;
          dailyLog.weatherCondition = wxData.weather?.[0]?.main || '';
          dailyLog.heatRisk = calculateHeatRisk(wxData.main.temp, wxData.main.humidity);
        }
      } catch (e) {
        console.error('Weather fetch failed:', e);
      }
    }

    // 2. Strava
    let cardioFetched = false;
    const stravaClientId = Deno.env.get('STRAVA_CLIENT_ID');
    const stravaClientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
    const stravaRefreshToken = Deno.env.get('STRAVA_REFRESH_TOKEN');

    if (stravaClientId && stravaClientSecret && stravaRefreshToken) {
      try {
        const sAuthRes = await fetch('https://www.strava.com/api/v3/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `client_id=${stravaClientId}&client_secret=${stravaClientSecret}&refresh_token=${stravaRefreshToken}&grant_type=refresh_token`,
        });
        const sAuth = await sAuthRes.json();

        if (sAuth.access_token) {
          const nowUnix = Math.floor(Date.now() / 1000);
          const startOfDayUnix = nowUnix - (nowUnix % 86400);
          const actRes = await fetch(
            `https://www.strava.com/api/v3/athlete/activities?after=${startOfDayUnix}&per_page=30`,
            { headers: { Authorization: `Bearer ${sAuth.access_token}` } }
          );
          const activities = await actRes.json();

          if (Array.isArray(activities) && activities.length > 0) {
            const normalized = activities.map((a: Record<string, unknown>) => normalizeExternalActivity(a, 'strava'));
            dailyLog.importedActivities = normalized;
            const primary = normalized[0] as Record<string, unknown>;
            const startTime = new Date(String(primary.startLocal));
            dailyLog.cardioStart = `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`;
            dailyLog.cardioDuration = primary.durationMin;
            dailyLog.stravaActivityId = primary.externalActivityId;
            dailyLog.source = 'strava';
            dailyLog.cardioType = primary.cardioType;
            dailyLog.distanceKm = primary.distanceKm;
            dailyLog.avgHR = primary.avgHR;
            dailyLog.maxHR = primary.maxHR;
            dailyLog.avgPower = primary.avgPower;
            dailyLog.avgPace = primary.avgPace;
            dailyLog.caloriesBurned = primary.caloriesBurned;
            dailyLog.elevationGain = primary.elevationGain;
            dailyLog.rawActivity = activities[0];
            dailyLog.stravaEffort = (primary.trainingLoad as number) || 0;
            cardioFetched = true;

            if (sAuth.refresh_token && sAuth.refresh_token !== stravaRefreshToken) {
              await supabase
                .from('strava_connections')
                .upsert({
                  user_id: req.headers.get('x-user-id') || '00000000-0000-0000-0000-000000000001',
                  athlete_id: String(sAuth.athlete?.id || 'default'),
                  access_token: sAuth.access_token,
                  refresh_token: sAuth.refresh_token,
                  expires_at: sAuth.expires_at ? new Date(sAuth.expires_at * 1000).toISOString() : null,
                  scope: 'activity:read_all',
                }, { onConflict: 'user_id,athlete_id' });
            }
          }
        }
      } catch (e) {
        console.error('Strava fetch failed:', e);
      }
    }

    // 3. Intervals.icu
    if (!cardioFetched) {
      const intervalsId = Deno.env.get('INTERVALS_ATHLETE_ID');
      const intervalsKey = Deno.env.get('INTERVALS_API_KEY');
      if (intervalsId && intervalsKey) {
        try {
          const authStr = btoa(`API_KEY:${intervalsKey}`);
          const todayStr = new Date().toISOString().split('T')[0];
          const actRes = await fetch(
            `https://intervals.icu/api/v1/athlete/${intervalsId}/activities?oldest=${todayStr}&newest=${todayStr}`,
            { headers: { Authorization: `Basic ${authStr}` } }
          );
          const activities = await actRes.json();

          if (Array.isArray(activities) && activities.length > 0) {
            const normalized = activities.map((a: Record<string, unknown>) => normalizeExternalActivity(a, 'intervals'));
            dailyLog.importedActivities = (dailyLog.importedActivities as unknown[]).concat(normalized);
            const primary = normalized[0] as Record<string, unknown>;
            const startTime = new Date(String(primary.startLocal));
            dailyLog.cardioStart = `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`;
            dailyLog.cardioDuration = primary.durationMin;
            dailyLog.stravaActivityId = primary.externalActivityId;
            dailyLog.source = 'intervals';
            dailyLog.cardioType = primary.cardioType;
            dailyLog.distanceKm = primary.distanceKm;
            dailyLog.avgHR = primary.avgHR;
            dailyLog.maxHR = primary.maxHR;
            dailyLog.avgPower = primary.avgPower;
            dailyLog.avgPace = primary.avgPace;
            dailyLog.caloriesBurned = primary.caloriesBurned;
            dailyLog.elevationGain = primary.elevationGain;
            dailyLog.rawActivity = activities[0];
            dailyLog.stravaEffort = (primary.trainingLoad as number) || 0;
            cardioFetched = true;
          }
        } catch (e) {
          console.error('Intervals fetch failed:', e);
        }
      }
    }

    // 4. Google Fit
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const googleRefreshToken = Deno.env.get('GOOGLE_FIT_REFRESH_TOKEN');

    if (googleClientId && googleClientSecret && googleRefreshToken) {
      try {
        const gAuthRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `client_id=${googleClientId}&client_secret=${googleClientSecret}&refresh_token=${googleRefreshToken}&grant_type=refresh_token`,
        });
        const gAuth = await gAuthRes.json();

        if (gAuth.access_token) {
          const now = new Date();
          const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
          const endOfDay = startOfDay + 86400000;

          const fitRes = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${gAuth.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              aggregateBy: [
                { dataTypeName: 'com.google.nutrition' },
                { dataTypeName: 'com.google.activity.segment' },
              ],
              bucketByTime: { durationMillis: 86400000 },
              startTimeMillis: startOfDay,
              endTimeMillis: endOfDay,
            }),
          });

          const fitData = await fitRes.json();
          if (fitData?.bucket?.[0]?.dataset) {
            const datasets = fitData.bucket[0].dataset;

            const nutritionPoints = datasets.find((d: Record<string, unknown>) =>
              String(d.dataSourceId || '').includes('nutrition')
            )?.point;
            if (nutritionPoints?.length > 0) {
              const macros = (nutritionPoints[0] as Record<string, unknown>).value?.[0]?.mapVal;
              if (macros) {
                for (const macro of macros) {
                  if (macro.key === 'calories') dailyLog.totalCalories = Math.round(macro.value.fpVal);
                  if (macro.key === 'protein') dailyLog.proteinG = Math.round(macro.value.fpVal);
                  if (macro.key === 'carbs.total') dailyLog.carbsG = Math.round(macro.value.fpVal);
                  if (macro.key === 'fat.total') dailyLog.fatsG = Math.round(macro.value.fpVal);
                }
              }
            }

            if (!cardioFetched) {
              const activityPoints = datasets.find((d: Record<string, unknown>) =>
                String(d.dataSourceId || '').includes('activity.segment')
              )?.point;
              if (activityPoints?.length > 0) {
                let totalActiveMillis = 0;
                for (const p of activityPoints) {
                  const activityType = p.value?.[0]?.intVal;
                  if (activityType !== 3 && activityType !== 0 && activityType !== 4) {
                    totalActiveMillis += p.value?.[1]?.intVal || 0;
                  }
                }
                if (totalActiveMillis > 0) {
                  dailyLog.cardioDuration = Math.round(totalActiveMillis / 60000);
                  dailyLog.source = 'google_fit';
                  (dailyLog.importedActivities as unknown[]).push(
                    normalizeExternalActivity({
                      id: `google-fit-${new Date().toISOString().split('T')[0]}`,
                      name: 'Google Fit activity',
                      type: 'Workout',
                      start_date_local: new Date(startOfDay).toISOString(),
                      durationMin: dailyLog.cardioDuration,
                      stravaEffort: (dailyLog.cardioDuration as number) * 5,
                    }, 'google_fit')
                  );
                  cardioFetched = true;
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('Google Fit fetch failed:', e);
      }
    }

    // 5. Merge into Supabase
    const dateKey = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('n1_logs')
      .select('data')
      .eq('date_id', dateKey)
      .single();

    const existingData = (existing?.data as Record<string, unknown>) || {};
    const passiveKeys = [
      'weatherTempC', 'weatherHumidity', 'weatherWindSpeed', 'weatherCondition',
      'heatRisk', 'cardioStart', 'cardioDuration', 'stravaEffort', 'stravaActivityId',
      'source', 'cardioType', 'distanceKm', 'avgHR', 'maxHR', 'avgPower', 'avgPace',
      'caloriesBurned', 'elevationGain', 'rawActivity', 'totalCalories', 'proteinG',
      'carbsG', 'fatsG', 'importedActivities', 'syncedAt',
    ];

    const merged = { ...existingData };
    for (const key of passiveKeys) {
      const val = dailyLog[key];
      if (val !== undefined && val !== null && val !== '' && val !== 0 && !(Array.isArray(val) && val.length === 0)) {
        merged[key] = val;
      }
    }

    const { error } = await supabase.from('n1_logs').upsert(
      { date_id: dateKey, data: merged },
      { onConflict: 'date_id' }
    );

    if (error) throw error;

    const userId = req.headers.get('x-user-id') || '00000000-0000-0000-0000-000000000001';

    if (dailyLog.weatherTempC || dailyLog.weatherHumidity) {
      await supabase.from('weather_snapshots').upsert({
        user_id: userId,
        log_date: dateKey,
        temp_c: num(dailyLog.weatherTempC),
        humidity: num(dailyLog.weatherHumidity),
        wind_speed_mps: num(dailyLog.weatherWindSpeed),
        condition: String(dailyLog.weatherCondition || ''),
        heat_risk: String(dailyLog.heatRisk || 'unknown'),
      }, { onConflict: 'user_id,log_date' }).catch(e => console.warn('weather upsert', e));
    }

    const cardioDur = num(dailyLog.cardioDuration) || num(dailyLog.manualCardioDuration);
    if (cardioDur > 0 || num(dailyLog.stravaEffort) > 0) {
      await supabase.from('workout_sessions').upsert({
        user_id: userId,
        log_date: dateKey,
        source: String(dailyLog.source || 'strava'),
        external_id: `sync_${dateKey}`,
        session_type: 'cardio',
        started_at: String(dailyLog.cardioStart || '00:00'),
        duration_min: cardioDur,
        distance_km: num(dailyLog.distanceKm),
        avg_hr: num(dailyLog.avgHR),
        max_hr: num(dailyLog.maxHR),
        avg_pace_min_km: num(dailyLog.avgPace),
        avg_power_watts: num(dailyLog.avgPower),
        calories: num(dailyLog.caloriesBurned),
        strava_effort: num(dailyLog.stravaEffort),
      }, { onConflict: 'user_id,source,external_id' }).catch(e => console.warn('workout_session upsert', e));
    }

    if (num(dailyLog.totalCalories) > 0) {
      await supabase.from('nutrition_logs').upsert({
        user_id: userId,
        log_date: dateKey,
        total_calories: num(dailyLog.totalCalories),
        protein_g: num(dailyLog.proteinG),
        carbs_g: num(dailyLog.carbsG),
        fats_g: num(dailyLog.fatsG),
      }, { onConflict: 'user_id,log_date' }).catch(e => console.warn('nutrition upsert', e));
    }

    return corsResponse({
      success: true,
      date: dateKey,
      weather: dailyLog.weatherTempC ? 'fetched' : 'skipped',
      cardio: cardioFetched ? 'fetched' : 'none',
      nutrition: dailyLog.totalCalories ? 'fetched' : 'skipped',
      source: dailyLog.source || 'none',
      syncedAt: dailyLog.syncedAt,
    });
  } catch (err) {
    console.error('Sync error:', err);
    return corsResponse({ success: false, error: String(err) }, 500);
  }
});
