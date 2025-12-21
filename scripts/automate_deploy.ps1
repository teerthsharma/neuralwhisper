# Automation Script: Generate Audiobooks -> Push -> Deploy
# ==========================================================

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting Automated Deployment Pipeline..." -ForegroundColor Cyan

# 1. Generate Audiobooks
Write-Host "`n🎙️ Step 1: Generating Premium Audiobooks..." -ForegroundColor Yellow
$genProcess = Start-Process -FilePath "python" -ArgumentList "scripts/generate_audiobooks.py" -NoNewWindow -PassThru -Wait

if ($genProcess.ExitCode -ne 0) {
    Write-Error "❌ Audiobook generation failed! Stopping deployment."
    exit 1
}

# 2. Verify Output
$audioDir = "frontend/public/audiobooks"
if (!(Test-Path "$audioDir/genghis_khan_sample.wav") -or !(Test-Path "$audioDir/anime_sample.wav")) {
    Write-Error "❌ Generated audiobooks missing! Stopping deployment."
    exit 1
}
Write-Host "✅ Audiobooks verified." -ForegroundColor Green

# 3. Git Push
Write-Host "`n📦 Step 2: Pushing to GitHub..." -ForegroundColor Yellow
git add .
git commit -m "feat: add premium audiobooks and liquid UI"
git push

# 4. Vercel Deploy
Write-Host "`n☁️ Step 3: Deploying to Vercel (Production)..." -ForegroundColor Yellow
vercel --prod

Write-Host "`n MISSION COMPLETE: Deployment Successful!" -ForegroundColor Cyan
