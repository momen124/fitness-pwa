$SERVER = "root@49.13.113.116"
$DEST = "/var/www/fitness-pwa"
$KEY = "C:\Users\Hp\.ssh\id_ed25519"

Write-Host "🚀 Starting Deployment to $SERVER..." -ForegroundColor Cyan

# Define the core files required for the PWA to run on the web server
$FILES = @("index.html", "app.js", "styles.css", "sw.js", "manifest.json")

foreach ($file in $FILES) {
    if (Test-Path $file) {
        Write-Host "   -> Uploading $file..." -ForegroundColor Gray
        scp -o StrictHostKeyChecking=no -i $KEY $file "${SERVER}:${DEST}/"
    } else {
        Write-Host "   -> Warning: $file not found locally. Skipping." -ForegroundColor Yellow
    }
}

Write-Host "✅ Deployment Complete! The live site has been updated." -ForegroundColor Green
