# Restore drill (run quarterly, and before trusting the backups with real data): load the newest
# backup from R2 into a throwaway Postgres and compare row counts with the live database.
# Run with the prod stack up. Counts differ only if something changed since that backup.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot)

$name = 'relationtree-restore-drill'
$work = Join-Path $env:TEMP $name
New-Item -ItemType Directory -Force $work | Out-Null

function Invoke-Native {
    & $args[0] @($args | Select-Object -Skip 1)
    if ($LASTEXITCODE -ne 0) { throw "$($args[0]) failed (exit $LASTEXITCODE): $args" }
}

$tables = @('auth_user', 'relationtree_tree', 'relationtree_person', 'relationtree_connection')
$query = ($tables | ForEach-Object { "SELECT '$_', count(*) FROM $_" }) -join ' UNION ALL '

try {
    Write-Host 'Downloading the newest backup...'
    Invoke-Native docker compose --env-file .env.prod run --rm --no-deps -v "${work}:/restore" `
        backup python manage.py fetch_latest_backup /restore/latest.dump

    Write-Host 'Restoring into a throwaway Postgres...'
    docker rm -f $name *> $null
    Invoke-Native docker run -d --name $name -e POSTGRES_PASSWORD=drill -v "${work}:/restore:ro" `
        pgvector/pgvector:pg18 | Out-Null
    $deadline = (Get-Date).AddSeconds(60)
    do {
        Start-Sleep -Seconds 2
        docker exec $name pg_isready -U postgres *> $null
        if ((Get-Date) -gt $deadline) { throw 'throwaway Postgres did not start' }
    } while ($LASTEXITCODE -ne 0)
    Invoke-Native docker exec $name createdb -U postgres relationtree
    Invoke-Native docker exec $name pg_restore -U postgres -d relationtree --no-owner `
        --exit-on-error /restore/latest.dump

    $restored = docker exec $name psql -U postgres -d relationtree -tA -F '=' -c $query
    $live = docker compose --env-file .env.prod exec -T db psql -U relationtree -d relationtree `
        -tA -F '=' -c $query
    Write-Host "`nTable = restored / live"
    $same = $true
    foreach ($table in $tables) {
        $r = ($restored | Where-Object { $_ -like "$table=*" }) -replace '.*='
        $l = ($live | Where-Object { $_ -like "$table=*" }) -replace '.*='
        if ($r -ne $l) { $same = $false }
        Write-Host ("  {0,-26} {1,6} / {2}" -f $table, $r, $l)
    }
    if ($same) { Write-Host "`nRestore drill passed." }
    else { Write-Host "`nCounts differ: fine if data changed since the backup, otherwise investigate." }
}
finally {
    docker rm -f $name *> $null
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
