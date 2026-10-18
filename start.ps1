# Start production on the home server: Docker Desktop, Ollama, the newest image, migrations,
# the stack, then warm the chat model so the first summary doesn't wait ~100 s for it to load.
#   .\start.ps1             pull the newest image from GHCR (normal)
#   .\start.ps1 -SkipPull   use the image already on this machine (e.g. one built locally)
param([switch]$SkipPull)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Invoke-Compose {
    docker compose --env-file .env.prod @args
    if ($LASTEXITCODE -ne 0) { throw "docker compose $args failed (exit $LASTEXITCODE)" }
}

function Wait-Until([string]$What, [int]$Seconds, [scriptblock]$Ready) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while (-not (& $Ready)) {
        if ((Get-Date) -gt $deadline) { throw "$What did not become ready within $Seconds s" }
        Start-Sleep -Seconds 2
    }
}

function Test-Docker { docker info *> $null; return $LASTEXITCODE -eq 0 }

function Test-Ollama {
    try { Invoke-RestMethod http://127.0.0.1:11434/api/version -TimeoutSec 2 | Out-Null; return $true }
    catch { return $false }
}

if (-not (Test-Path .env.prod)) { throw '.env.prod is missing: copy .env.prod.example and fill it in' }

if (-not (Test-Docker)) {
    Write-Host 'Starting Docker Desktop...'
    Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    Wait-Until 'Docker' 180 { Test-Docker }
}

if (-not (Test-Ollama)) {
    Write-Host 'Starting Ollama...'
    Start-Process "$env:LOCALAPPDATA\Programs\Ollama\ollama app.exe"
    Wait-Until 'Ollama' 60 { Test-Ollama }
}

if (-not $SkipPull) {
    Write-Host 'Pulling images...'
    Invoke-Compose pull
}

Write-Host 'Migrating...'
Invoke-Compose run --rm api python manage.py migrate --noinput

Write-Host 'Starting the stack...'
Invoke-Compose up -d --remove-orphans

$chatModel = 'qwen3.8:27b'
$line = Select-String -Path .env.prod -Pattern '^CHAT_MODEL=(.+)$'
if ($line) { $chatModel = $line.Matches[0].Groups[1].Value.Trim() }
Write-Host "Warming $chatModel (a cold load takes ~100 s; the app already works meanwhile)..."
$body = @{ model = $chatModel; keep_alive = '1h' } | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:11434/api/generate -Method Post -Body $body `
    -ContentType 'application/json' -TimeoutSec 300 | Out-Null

Write-Host 'Up. Admin: http://127.0.0.1:8002/admin/   Stop with .\stop.ps1'
