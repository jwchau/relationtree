# Stop production. The backup service gets SIGTERM first and has up to 60 s to upload a final
# backup (if anything changed since the last one); its log lines show what happened.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

docker compose --env-file .env.prod stop backup
if ($LASTEXITCODE -ne 0) { throw "stopping the backup service failed (exit $LASTEXITCODE)" }
docker compose --env-file .env.prod logs --no-log-prefix --tail 3 backup

docker compose --env-file .env.prod down
if ($LASTEXITCODE -ne 0) { throw "docker compose down failed (exit $LASTEXITCODE)" }
