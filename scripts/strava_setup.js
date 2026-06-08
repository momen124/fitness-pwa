/**
 * Strava One-Time OAuth Setup
 * Run this script to get your STRAVA_REFRESH_TOKEN.
 * 
 * Usage:
 * $env:STRAVA_CLIENT_ID="your_client_id"
 * $env:STRAVA_CLIENT_SECRET="your_client_secret"
 * node strava_setup.js
 */

const http = require('http');

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/callback';
const SCOPE = 'activity:read_all';

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ ERROR: Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET in environment variables.");
    process.exit(1);
}

const authUrl = `http://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&approval_prompt=force&scope=${SCOPE}`;

console.log("\n=======================================================");
console.log("🚴‍♂️ Strava Authorization Setup");
console.log("=======================================================\n");
console.log("1. Click the link below to authorize the N=1 Laboratory:");
console.log(`\n👉 ${authUrl}\n`);
console.log("2. After logging in and clicking 'Authorize', wait for this terminal to print your token.\n");

const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/callback')) {
        const urlParams = new URLSearchParams(req.url.split('?')[1]);
        const code = urlParams.get('code');

        if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Success! You can close this window and check your terminal.</h1>');
            
            console.log("🔄 Authorization Code received. Exchanging for Refresh Token...");
            
            try {
                const tokenRes = await fetch('https://www.strava.com/api/v3/oauth/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${code}&grant_type=authorization_code`
                });
                
                const tokenData = await tokenRes.json();
                
                if (tokenData.refresh_token) {
                    console.log("\n✅ SUCCESS! Save this to your environment / GitHub Secrets:\n");
                    console.log("Name: STRAVA_REFRESH_TOKEN");
                    console.log(`Value: ${tokenData.refresh_token}\n`);
                    console.log("You can now stop this script (Ctrl+C).");
                } else {
                    console.error("❌ Failed to get refresh token:", tokenData);
                }
            } catch (err) {
                console.error("❌ Error exchanging code:", err);
            }
            
            setTimeout(() => process.exit(0), 1000);
        } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Error: No code found in URL</h1>');
        }
    }
});

server.listen(3000, () => {
    console.log("⏳ Listening on http://localhost:3000 for the callback...");
});
