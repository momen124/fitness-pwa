const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const inbodyScans = [
    {
        date_id: "2026-04-07",
        data: {
            inbodyDate: "2026-04-07",
            inbodyWeight: 119.60,
            inbodyBmi: 40.9,
            inbodyBf: 37.5,
            inbodyTbw: 47.5,
            inbodySmm: 24.1,
            inbodyBmr: 2870
        }
    },
    {
        date_id: "2026-04-15",
        data: {
            inbodyDate: "2026-04-15",
            inbodyWeight: 118.05,
            inbodyBmi: 39.9,
            inbodyBf: 35.5,
            inbodyTbw: 48.1,
            inbodySmm: 25.0,
            inbodyBmr: 2832
        }
    },
    {
        date_id: "2026-05-12",
        data: {
            inbodyDate: "2026-05-12",
            inbodyWeight: 116.0,
            inbodyBmi: 39.4,
            inbodyBf: 33.8,
            inbodyTbw: 48.7,
            inbodySmm: 25.8,
            inbodyBmr: 2800
        }
    },
    {
        date_id: "2026-06-01",
        data: {
            inbodyDate: "2026-06-01",
            inbodyWeight: 115.5,
            inbodyBmi: 39.0,
            inbodyBf: 30.8,
            inbodyTbw: 49.9,
            inbodySmm: 27.4,
            inbodyBmr: 2772
        }
    }
];

async function uploadInBody() {
    for (const scan of inbodyScans) {
        console.log(`Processing scan for ${scan.date_id}...`);
        
        // Fetch existing
        const getRes = await fetch(`${SUPABASE_URL}/rest/v1/n1_logs?date_id=eq.${scan.date_id}`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        const rows = await getRes.json();
        let existingData = {};
        if (rows.length > 0) {
            existingData = rows[0].data || {};
        }

        // Merge
        const mergedData = { ...existingData, ...scan.data };

        // Upsert
        const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/n1_logs`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({
                date_id: scan.date_id,
                data: mergedData
            })
        });

        if (upsertRes.ok) {
            console.log(`✅ Uploaded ${scan.date_id}`);
        } else {
            console.error(`❌ Failed ${scan.date_id}:`, await upsertRes.text());
        }
    }
}

uploadInBody();
