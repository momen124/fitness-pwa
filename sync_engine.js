/**
 * The Passive Engine (N=1 Performance Lab)
 * 
 * This script runs automatically (e.g., via GitHub Actions cron job)
 * to fetch passive biological and environmental data and sync it to Supabase.
 * 
 * Required Environment Variables:
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 * - INTERVALS_ATHLETE_ID
 * - INTERVALS_API_KEY
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 * - GOOGLE_FIT_REFRESH_TOKEN
 * - STRAVA_CLIENT_ID
 * - STRAVA_CLIENT_SECRET
 * - STRAVA_REFRESH_TOKEN
 * - OPENWEATHER_API_KEY
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// API Endpoints
const INTERVALS_API_URL = 'https://intervals.icu/api/v1/athlete';
const OPENWEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather';
const GOOGLE_AUTH_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_FIT_API = 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate';

// Alexandria, Egypt Coordinates
const ALEXANDRIA_LAT = 31.2001;
const ALEXANDRIA_LON = 29.9187;

function num(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function formatPaceFromSpeed(speedMetersPerSecond) {
    const speed = num(speedMetersPerSecond);
    if (speed <= 0) return '';
    const minPerKm = 1000 / speed / 60;
    const minutes = Math.floor(minPerKm);
    const seconds = Math.round((minPerKm - minutes) * 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}/km`;
}

function getDateKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
    return date.toISOString().split('T')[0];
}

function calculateHeatRisk(temperatureC, humidityPercent) {
    const temp = num(temperatureC);
    const humidity = num(humidityPercent);
    if (!temp || !humidity) return 'unknown';
    if (temp >= 35 || humidity >= 75) return 'critical';
    if (temp >= 30 && humidity >= 60) return 'high';
    return 'low';
}

function mapActivityType(raw = {}) {
    const type = String(raw.sport_type || raw.type || raw.activity_type || '').toLowerCase();
    if (type.includes('ride') || type.includes('bike') || type.includes('cycling')) return { appType: 'bike', cardioType: 'CYCLING', impactLevel: 'zero' };
    if (type.includes('row')) return { appType: 'row', cardioType: 'ROWING', impactLevel: 'zero' };
    if (type.includes('swim')) return { appType: 'swim', cardioType: 'SWIMMING', impactLevel: 'zero' };
    if (type.includes('walk') || type.includes('hike')) return { appType: 'run_walk', cardioType: 'WALK_JOG', impactLevel: 'low' };
    if (type.includes('run')) return { appType: 'run_walk', cardioType: 'RUNNING', impactLevel: 'high' };
    return { appType: 'recovery', cardioType: 'NONE', impactLevel: 'low' };
}

function normalizeExternalActivity(raw = {}, source = 'strava') {
    const mapping = mapActivityType(raw);
    const startLocal = raw.start_date_local || raw.start_date || raw.startTime || new Date().toISOString();
    const durationMin = Math.round(num(raw.moving_time || raw.elapsed_time || raw.durationMin || raw.duration_min) / (raw.durationMin || raw.duration_min ? 1 : 60));
    const distanceKm = num(raw.distanceKm || raw.distance_km || raw.distance) > 100
        ? num(raw.distanceKm || raw.distance_km || raw.distance) / 1000
        : num(raw.distanceKm || raw.distance_km || raw.distance);

    return {
        id: `${source}:${raw.id || raw.activity_id || startLocal}`,
        source,
        externalActivityId: String(raw.id || raw.activity_id || startLocal),
        name: raw.name || raw.title || raw.type || raw.sport_type || 'Imported activity',
        type: mapping.appType,
        modality: raw.sport_type || raw.type || raw.activity_type || 'Workout',
        cardioType: mapping.cardioType,
        impactLevel: mapping.impactLevel,
        startLocal,
        dateKey: getDateKey(startLocal),
        durationMin,
        distanceKm,
        avgHR: num(raw.average_heartrate || raw.avg_hr) || '',
        maxHR: num(raw.max_heartrate || raw.max_hr) || '',
        avgPower: num(raw.average_watts || raw.weighted_average_watts || raw.avg_power) || '',
        avgPace: raw.avgPace || formatPaceFromSpeed(raw.average_speed),
        caloriesBurned: num(raw.calories || raw.caloriesBurned || raw.kilojoules) || '',
        elevationGain: num(raw.total_elevation_gain || raw.elevation_gain) || '',
        trainingLoad: num(raw.trainingLoad || raw.training_load || raw.suffer_score || raw.calc_relative_effort || raw.icu_training_load || raw.stravaEffort) || (durationMin ? durationMin * 5 : 0),
        rpe: '',
        painRegion: '',
        painScore: '',
        fueled: '',
        intraCarbs: '',
        notes: '',
        raw,
        importedAt: new Date().toISOString()
    };
}

async function runPassiveEngine() {
    console.log("🚀 Starting N=1 Passive Engine...");
    
    let dailyLog = {
        cardioStart: "00:00",
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
        stravaActivitiesRaw: [],
        syncedAt: new Date().toISOString()
    };

    try {
        // 1. Fetch Weather Data (Alexandria)
        if (process.env.OPENWEATHER_API_KEY) {
            console.log("Fetching Weather...");
            const wxRes = await fetch(`${OPENWEATHER_URL}?lat=${ALEXANDRIA_LAT}&lon=${ALEXANDRIA_LON}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`);
            const wxData = await wxRes.json();
            if (wxData.main) {
                dailyLog.weatherTempC = wxData.main.temp;
                dailyLog.weatherHumidity = wxData.main.humidity;
                dailyLog.weatherWindSpeed = wxData.wind?.speed || 0;
                dailyLog.weatherCondition = wxData.weather?.[0]?.main || '';
                dailyLog.heatRisk = calculateHeatRisk(dailyLog.weatherTempC, dailyLog.weatherHumidity);
            }
        }

        // 2. Fetch Cardio Data via Intervals.icu (Bypassing Strava API Paywall) or direct Strava API
        let cardioFetched = false;
        
        if (process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET && process.env.STRAVA_REFRESH_TOKEN) {
            console.log("Fetching Cardio from Strava...");
            const sAuthRes = await fetch('https://www.strava.com/api/v3/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `client_id=${process.env.STRAVA_CLIENT_ID}&client_secret=${process.env.STRAVA_CLIENT_SECRET}&refresh_token=${process.env.STRAVA_REFRESH_TOKEN}&grant_type=refresh_token`
            });
            const sAuth = await sAuthRes.json();
            
            if (sAuth.access_token) {
                const nowUnix = Math.floor(Date.now() / 1000);
                const startOfDayUnix = nowUnix - (nowUnix % 86400); // Approximate
                
                const actRes = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${startOfDayUnix}&per_page=30`, {
                    headers: { 'Authorization': `Bearer ${sAuth.access_token}` }
                });
                const activities = await actRes.json();
                
                if (Array.isArray(activities) && activities.length > 0) {
                    dailyLog.stravaActivitiesRaw = activities;
                    dailyLog.importedActivities = activities.map(activity => normalizeExternalActivity(activity, 'strava'));
                    const primary = activities[0]; 
                    const primaryNormalized = dailyLog.importedActivities[0];
                    const startTime = new Date(primaryNormalized.startLocal);
                    dailyLog.cardioStart = `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`;
                    dailyLog.cardioDuration = primaryNormalized.durationMin;
                    dailyLog.stravaActivityId = primaryNormalized.externalActivityId;
                    dailyLog.source = 'strava';
                    dailyLog.cardioType = primaryNormalized.cardioType;
                    dailyLog.distanceKm = primaryNormalized.distanceKm;
                    dailyLog.avgHR = primaryNormalized.avgHR;
                    dailyLog.maxHR = primaryNormalized.maxHR;
                    dailyLog.avgPower = primaryNormalized.avgPower;
                    dailyLog.avgPace = primaryNormalized.avgPace;
                    dailyLog.caloriesBurned = primaryNormalized.caloriesBurned;
                    dailyLog.elevationGain = primaryNormalized.elevationGain;
                    dailyLog.rawActivity = primary;
                    // Strava API exposes suffer_score if HR monitor used (requires premium for UI, but sometimes API returns it)
                    // Fallback to relative effort or distance
                    dailyLog.stravaEffort = primaryNormalized.trainingLoad || Math.round(num(primary.distance) / 100);
                    cardioFetched = true;
                }
            }
        }
        
        if (!cardioFetched && process.env.INTERVALS_ATHLETE_ID && process.env.INTERVALS_API_KEY) {
            console.log("Fetching Cardio from Intervals.icu...");
            // Intervals API uses HTTP Basic Auth with username "API_KEY"
            const authStr = Buffer.from(`API_KEY:${process.env.INTERVALS_API_KEY}`).toString('base64');
            const todayStr = new Date().toISOString().split('T')[0];
            
            const actRes = await fetch(`${INTERVALS_API_URL}/${process.env.INTERVALS_ATHLETE_ID}/activities?oldest=${todayStr}&newest=${todayStr}`, {
                headers: { 'Authorization': `Basic ${authStr}` }
            });
            const activities = await actRes.json();
            
            if (Array.isArray(activities) && activities.length > 0) {
                const normalized = activities.map(activity => normalizeExternalActivity(activity, 'intervals'));
                dailyLog.importedActivities = dailyLog.importedActivities.concat(normalized);
                // Aggregate or take primary cardio
                const primary = activities[0]; 
                const primaryNormalized = normalized[0];
                const startTime = new Date(primaryNormalized.startLocal);
                dailyLog.cardioStart = `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`;
                dailyLog.cardioDuration = primaryNormalized.durationMin;
                dailyLog.stravaActivityId = primaryNormalized.externalActivityId;
                dailyLog.source = 'intervals';
                dailyLog.cardioType = primaryNormalized.cardioType;
                dailyLog.distanceKm = primaryNormalized.distanceKm;
                dailyLog.avgHR = primaryNormalized.avgHR;
                dailyLog.maxHR = primaryNormalized.maxHR;
                dailyLog.avgPower = primaryNormalized.avgPower;
                dailyLog.avgPace = primaryNormalized.avgPace;
                dailyLog.caloriesBurned = primaryNormalized.caloriesBurned;
                dailyLog.elevationGain = primaryNormalized.elevationGain;
                dailyLog.rawActivity = primary;
                dailyLog.stravaEffort = primaryNormalized.trainingLoad || 0; // Equivalent to Strava Relative Effort
                cardioFetched = true;
            }
        }

        // 3. Fetch Nutrition Data via Google Fit
        if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_FIT_REFRESH_TOKEN) {
            console.log("Fetching Nutrition from Google Fit...");
            // Get fresh access token
            const gAuthRes = await fetch(GOOGLE_AUTH_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `client_id=${process.env.GOOGLE_CLIENT_ID}&client_secret=${process.env.GOOGLE_CLIENT_SECRET}&refresh_token=${process.env.GOOGLE_FIT_REFRESH_TOKEN}&grant_type=refresh_token`
            });
            const gAuth = await gAuthRes.json();

            if (gAuth.access_token) {
                const now = new Date();
                const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                const endOfDay = startOfDay + 86400000;

                const fitRes = await fetch(GOOGLE_FIT_API, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${gAuth.access_token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        aggregateBy: [
                            { dataTypeName: "com.google.nutrition" },
                            { dataTypeName: "com.google.activity.segment" }
                        ],
                        bucketByTime: { durationMillis: 86400000 },
                        startTimeMillis: startOfDay,
                        endTimeMillis: endOfDay
                    })
                });

                const fitData = await fitRes.json();
                
                if (fitData && fitData.bucket && fitData.bucket.length > 0) {
                    const datasets = fitData.bucket[0].dataset;
                    
                    // Nutrition Parsing
                    const nutritionPoints = datasets.find(d => d.dataSourceId.includes('nutrition'))?.point;
                    if (nutritionPoints && nutritionPoints.length > 0) {
                        const macros = nutritionPoints[0].value[0].mapVal;
                        macros.forEach(macro => {
                            if (macro.key === "calories") dailyLog.totalCalories = Math.round(macro.value.fpVal);
                            if (macro.key === "protein") dailyLog.proteinG = Math.round(macro.value.fpVal);
                            if (macro.key === "carbs.total") dailyLog.carbsG = Math.round(macro.value.fpVal);
                            if (macro.key === "fat.total") dailyLog.fatsG = Math.round(macro.value.fpVal);
                        });
                    }

                    // Activity (Samsung Health/Google Fit) Parsing - Fallback if no Strava
                    if (!cardioFetched) {
                        const activityPoints = datasets.find(d => d.dataSourceId.includes('activity.segment'))?.point;
                        if (activityPoints && activityPoints.length > 0) {
                            let totalActiveMillis = 0;
                            activityPoints.forEach(p => {
                                const activityType = p.value[0].intVal;
                                // 7=Walking, 8=Running, 1=Biking, etc. Ignore 3=Still, 0=InVehicle, 4=Unknown
                                if (activityType !== 3 && activityType !== 0 && activityType !== 4) {
                                    totalActiveMillis += p.value[1].intVal; // duration in millis
                                }
                            });
                            if (totalActiveMillis > 0) {
                                dailyLog.cardioDuration = Math.round(totalActiveMillis / 60000);
                                dailyLog.source = 'google_fit';
                                dailyLog.importedActivities.push(normalizeExternalActivity({
                                    id: `google-fit-${new Date().toISOString().split('T')[0]}`,
                                    name: 'Google Fit activity',
                                    type: 'Workout',
                                    start_date_local: new Date(startOfDay).toISOString(),
                                    durationMin: dailyLog.cardioDuration,
                                    stravaEffort: dailyLog.cardioDuration * 5
                                }, 'google_fit'));
                                cardioFetched = true;
                                console.log(`Fetched ${dailyLog.cardioDuration}m of activity from Google Fit / Samsung Health`);
                            }
                        }
                    }
                }
            } else {
                console.error("Google Fit Auth Failed:", gAuth);
            }
        }

        // 4. Upsert to Supabase
        console.log("Syncing to Supabase...");
        const dateKey = new Date().toISOString().split('T')[0];
        
        // Fetch existing log first to merge (so we don't overwrite subjective data)
        const getRes = await fetch(`${SUPABASE_URL}/rest/v1/n1_logs?date_id=eq.${dateKey}`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        
        let existingData = {};
        if (getRes.ok) {
            const rows = await getRes.json();
            if (rows.length > 0) existingData = rows[0].data || {};
        }

        // Merge passive data into existing
        const mergedData = { ...existingData, ...dailyLog };

        const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/n1_logs`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({
                date_id: dateKey,
                data: mergedData
            })
        });

        if (!upsertRes.ok) {
            throw new Error(`Supabase error: ${upsertRes.statusText}`);
        }

        console.log("✅ Passive Engine complete. Dashboard is armed.");

    } catch (err) {
        console.error("❌ Sync Error:", err);
        process.exit(1);
    }
}

// Execute
runPassiveEngine();
