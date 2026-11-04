<#
  PracticeHub — funzioni comuni degli script di aggiornamento (K6, PR-26). Da includere con ". lib-deploy.ps1".
#>

$ErrorActionPreference = "Stop"
# Cartella deploy/ anche dove $PSScriptRoot è vuoto (Windows PowerShell 5.1).
$DeployDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$ComposeFile = Join-Path $DeployDir "compose.yml"
$MongoUri = "mongodb://mongo:27018/?replicaSet=rs0"

function Read-DeployEnv([string]$path) {
  $vars = @{}
  foreach ($line in Get-Content -Path $path -Encoding UTF8) {
    if ($line -match '^\s*#' -or $line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') { continue }
    $vars[$Matches[1]] = $Matches[2].Trim().Trim('"')
  }
  foreach ($k in @("PH_PROJECT", "PH_TAG", "PH_DB")) { if (-not $vars[$k]) { throw "$k mancante in $path" } }
  return $vars
}

function Set-DeployTag([string]$path, [string]$tag) {
  $lines = Get-Content -Path $path -Encoding UTF8
  $found = $false
  $out = foreach ($l in $lines) { if ($l -match '^\s*PH_TAG\s*=') { $found = $true; "PH_TAG=$tag" } else { $l } }
  if (-not $found) { $out = @($out) + "PH_TAG=$tag" }
  Set-Content -Path $path -Value $out -Encoding UTF8
}

# Vero se l'immagine esiste. Windows PowerShell 5.1 con ErrorActionPreference=Stop trasforma in errore bloccante lo
# stderr rediretto di un comando esterno ("No such image"): qui si tollera e decide solo il codice di uscita.
function Test-DockerImage([string]$ref) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { & docker image inspect $ref *> $null; return ($LASTEXITCODE -eq 0) } finally { $ErrorActionPreference = $prev }
}

function Invoke-Compose([string]$envFile, [string[]]$arguments) {
  & docker compose -f $ComposeFile --env-file $envFile @arguments
  if ($LASTEXITCODE -ne 0) { throw "docker compose $($arguments -join ' ') non riuscito (codice $LASTEXITCODE)" }
}

function Write-DeployLog([string]$msg) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path (Join-Path $DeployDir "aggiornamenti.log") -Value $line -Encoding UTF8
  Write-Host $line
}

# Attende che i servizi indicati risultino "healthy" (massimo $timeoutSec secondi).
function Wait-Healthy([string]$envFile, [string[]]$services, [int]$timeoutSec = 300) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  foreach ($svc in $services) {
    while ($true) {
      $id = (& docker compose -f $ComposeFile --env-file $envFile ps -q $svc) | Select-Object -First 1
      $status = if ($id) { (& docker inspect -f "{{.State.Health.Status}}" $id) } else { "assente" }
      if ($status -eq "healthy") { Write-Host "  ${svc}: healthy"; break }
      if ((Get-Date) -gt $deadline) { throw "$svc non è healthy dopo $timeoutSec s (stato: $status)" }
      Start-Sleep -Seconds 5
    }
  }
}

# Copia verificata dei due database nella cartella /backups/aggiornamenti/<nome> del servizio backup.
function New-UpdateCopy([string]$envFile, $vars, [string]$name) {
  $dir = "/backups/aggiornamenti/$name"
  foreach ($db in @($vars["PH_DB"], "$($vars["PH_DB"])_legacy")) {
    $out = & docker compose -f $ComposeFile --env-file $envFile exec -T backup node ops/backup-db.mjs backup --uri $MongoUri --db $db --dir $dir
    if ($LASTEXITCODE -ne 0) { throw "copia di $db non riuscita: $out" }
    $folder = ($out | Select-String -Pattern "Backup completato: (.+)$").Matches[0].Groups[1].Value.Trim()
    & docker compose -f $ComposeFile --env-file $envFile exec -T backup node ops/backup-db.mjs verify --from $folder | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "verifica della copia $folder non superata: aggiornamento annullato" }
    Write-Host "  copia verificata: $folder"
  }
  return $dir
}
