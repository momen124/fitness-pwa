const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

async function check() {
    const today = new Date().toISOString().split('T')[0];
    console.log("Checking date:", today);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/n1_logs?date_id=eq.${today}`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}
check();
