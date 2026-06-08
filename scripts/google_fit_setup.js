/**
 * Google Fit One-Time OAuth Setup
 * Run this script to get your GOOGLE_FIT_REFRESH_TOKEN.
 * 
 * Usage:
 * $env:GOOGLE_CLIENT_ID="your_client_id"
 * $env:GOOGLE_CLIENT_SECRET="your_client_secret"
 * node google_fit_setup.js
 */

const http = require('http');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/callback';
const SCOPE = 'https://www.googleapis.com/auth/fitness.nutrition.read';

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ ERROR: Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables.");
    process.exit(1);
}

// Ensure offline access and force consent to guarantee a refresh token
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPE)}&access_type=offline&prompt=consent`;

console.log("\n=======================================================");
console.log("🏃‍♂️ Google Fit Authorization Setup");
console.log("=======================================================\n");
console.log("1. Click the link below to authorize the N=1 Laboratory:");
console.log(`\n👉 ${authUrl}\n`);
console.log("2. After logging in and clicking 'Allow', wait for this terminal to print your token.\n");

const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/callback')) {
        const urlParams = new URLSearchParams(req.url.split('?')[1]);
        const code = urlParams.get('code');

        if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Success! You can close this window and check your terminal.</h1>');
            
            console.log("🔄 Authorization Code received. Exchanging for Refresh Token...");
            
            try {
                const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
                });
                
                const tokenData = await tokenRes.json();
                
                if (tokenData.refresh_token) {
                    console.log("\n✅ SUCCESS! Save this to your GitHub Secrets:\n");
                    console.log("Name: GOOGLE_FIT_REFRESH_TOKEN");
                    console.log(`Value: ${tokenData.refresh_token}\n`);
                    console.log("You can now stop this script (Ctrl+C).");
                } else {
                    console.error("❌ Failed to get refresh token:", tokenData);
                    console.error("Did you already authorize this app? You must force the consent screen (prompt=consent) to get a new refresh token.");
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
