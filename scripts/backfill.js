const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_FIT_REFRESH_TOKEN = process.env.GOOGLE_FIT_REFRESH_TOKEN;
const INTERVALS_ATHLETE_ID = process.env.INTERVALS_ATHLETE_ID;
const INTERVALS_API_KEY = process.env.INTERVALS_API_KEY;

const GOOGLE_AUTH_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_FIT_API = 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate';

async function backfill() {
    console.log("🚀 Starting Backfill Engine (Last 90 Days)...");

    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); // Tomorrow 00:00
    const startDate = new Date(endDate.getTime() - (90 * 86400000)); // 90 days ago

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = new Date().toISOString().split('T')[0];
    
    let logsByDate = {}; // date_id -> { ...dailyLog }

    // 1. Fetch Intervals (Strava equivalent)
    console.log(`Fetching Intervals from ${startStr} to ${endStr}...`);
    const authStr = Buffer.from(`API_KEY:${INTERVALS_API_KEY}`).toString('base64');
    const actRes = await fetch(`https://intervals.icu/api/v1/athlete/${INTERVALS_ATHLETE_ID}/activities?oldest=${startStr}&newest=${endStr}`, {
        headers: { 'Authorization': `Basic ${authStr}` }
    });
    
    if (actRes.ok) {
        const activities = await actRes.json();
        console.log(`Found ${activities.length} Intervals activities.`);
        for (const act of activities) {
            const dateStr = act.start_date_local.split('T')[0];
            if (!logsByDate[dateStr]) logsByDate[dateStr] = {};
            const startTime = new Date(act.start_date_local);
            logsByDate[dateStr].cardioStart = `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`;
            logsByDate[dateStr].cardioDuration = Math.round((act.moving_time || 0) / 60);
            logsByDate[dateStr].stravaEffort = act.icu_training_load || 0;
            logsByDate[dateStr]._cardioFetched = true;
        }
    } else {
        console.error("Failed Intervals", await actRes.text());
    }

    // 2. Fetch Google Fit (Samsung Health)
    console.log(`Fetching Google Fit from ${startStr} to ${endStr}...`);
    const gAuthRes = await fetch(GOOGLE_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `client_id=${GOOGLE_CLIENT_ID}&client_secret=${GOOGLE_CLIENT_SECRET}&refresh_token=${GOOGLE_FIT_REFRESH_TOKEN}&grant_type=refresh_token`
    });
    const gAuth = await gAuthRes.json();

    if (gAuth.access_token) {
        const fitRes = await fetch(GOOGLE_FIT_API, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${gAuth.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                aggregateBy: [{ dataTypeName: "com.google.activity.segment" }],
                bucketByTime: { durationMillis: 86400000 },
                startTimeMillis: startDate.getTime(),
                endTimeMillis: endDate.getTime()
            })
        });

        const fitData = await fitRes.json();
        if (fitData && fitData.bucket) {
            console.log(`Found ${fitData.bucket.length} days of Google Fit buckets.`);
            for (const bucket of fitData.bucket) {
                const dateStr = new Date(parseInt(bucket.startTimeMillis)).toISOString().split('T')[0];
                const activityPoints = bucket.dataset[0]?.point;
                if (activityPoints && activityPoints.length > 0) {
                    if (!logsByDate[dateStr]) logsByDate[dateStr] = {};
                    // If Strava wasn't fetched, use Google Fit activity
                    if (!logsByDate[dateStr]._cardioFetched) {
                        let totalActiveMillis = 0;
                        activityPoints.forEach(p => {
                            const activityType = p.value[0].intVal;
                            if (activityType !== 3 && activityType !== 0 && activityType !== 4) {
                                totalActiveMillis += p.value[1].intVal;
                            }
                        });
                        if (totalActiveMillis > 0) {
                            logsByDate[dateStr].cardioDuration = Math.round(totalActiveMillis / 60000);
                        }
                    }
                }
            }
        }
    } else {
        console.error("Google Fit Auth Failed", gAuth);
    }

    // 3. Fetch existing Supabase logs
    console.log("Fetching existing Supabase logs to prevent overwriting manual data...");
    const getRes = await fetch(`${SUPABASE_URL}/rest/v1/n1_logs?select=date_id,data&date_id=gte.${startStr}&date_id=lte.${endStr}`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });
    const existingLogs = await getRes.json();
    let existingMap = {};
    if (existingLogs && Array.isArray(existingLogs)) {
        for (const row of existingLogs) {
            existingMap[row.date_id] = row.data || {};
        }
    }

    // 4. Upsert combined data
    console.log(`Upserting ${Object.keys(logsByDate).length} days of data to Supabase...`);
    const bulkData = [];
    for (const [dateStr, passiveData] of Object.entries(logsByDate)) {
        delete passiveData._cardioFetched; // Cleanup temp flag
        
        // Merge! Existing data takes precedence or is preserved. 
        // Passive data fills in the missing gaps.
        const mergedData = { ...(existingMap[dateStr] || {}), ...passiveData };
        
        bulkData.push({
            date_id: dateStr,
            data: mergedData
        });
    }

    if (bulkData.length > 0) {
        // Upload in batches of 30 to avoid payload size issues
        for (let i = 0; i < bulkData.length; i += 30) {
            const batch = bulkData.slice(i, i + 30);
            const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/n1_logs`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(batch)
            });
            if (upsertRes.ok) {
                console.log(`Successfully upserted batch ${i / 30 + 1}`);
            } else {
                console.error(`Error upserting batch ${i / 30 + 1}:`, await upsertRes.text());
            }
        }
        console.log("✅ Backfill Complete!");
    } else {
        console.log("No data found to backfill.");
    }
}

backfill();
