const INTERVALS_API_URL = 'https://intervals.icu/api/v1/athlete';
const ATHLETE_ID = process.env.INTERVALS_ATHLETE_ID;
const API_KEY = process.env.INTERVALS_API_KEY;

async function checkIntervals() {
    const authStr = Buffer.from(`API_KEY:${API_KEY}`).toString('base64');
    const todayStr = '2026-06-02';
    
    console.log(`Checking Intervals for ${todayStr}...`);
    const actRes = await fetch(`${INTERVALS_API_URL}/${ATHLETE_ID}/activities?oldest=${todayStr}&newest=${todayStr}`, {
        headers: { 'Authorization': `Basic ${authStr}` }
    });
    const activities = await actRes.json();
    console.log("Intervals activities:", activities);
}
checkIntervals();
