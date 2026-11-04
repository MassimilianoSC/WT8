<#
  PracticeHub — ritorno a un'immagine precedente (K6, PR-26).

    powershell -ExecutionPolicy Bypass -File deploy\torna-indietro.ps1 -Etichetta 2026-10-01a
    powershell -ExecutionPolicy Bypass -File deploy\torna-indietro.ps1 -Etichetta 2026-10-01a -Copia aggiornamenti/2026-10-15_09-00-00_2026-10-01a

  Senza -Copia rimette solo l'immagine precedente (i dati restano quelli attuali: va bene se l'aggiornamento non ha
  cambiato i dati). Con -Copia ferma app, worker e proxy, ripristina i due database dalla copia fatta prima
  dell'aggiornamento (con copia di sicurezza di quelli attuali e, in esercizio, --consenti-esercizio) e riparte.
  Se l'app nuova aveva migrato i dati, -Copia è obbligatorio: l'immagine vecchia rifiuta dati più recenti (PR-27).
#>
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$')][string]$Etichetta,
  [ValidatePattern('^aggiornamenti/[A-Za-z0-9_.-]+$')][string]$Copia,
  [string]$EnvFile = "",
  [switch]$Si
)
# Windows PowerShell 5.1 con -File: $PSScriptRoot è vuoto nei valori predefiniti di param(); si calcola qui.
$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $EnvFile) { $EnvFile = Join-Path $here ".env" }
. (Join-Path $here "lib-deploy.ps1")

$vars = Read-DeployEnv $EnvFile
$current = $vars["PH_TAG"]
if (-not (Test-DockerImage "practicehub:$Etichetta")) { throw "immagine practicehub:$Etichetta assente: niente da rimettere" }
Write-Host "Ritorno di $($vars["PH_PROJECT"]) ($($vars["PH_DB"])): practicehub:$current → practicehub:$Etichetta$(if ($Copia) { ", con ripristino dei dati da $Copia" })"
if (-not $Si) {
  $answer = Read-Host "Procedere? (si/no)"
  if ($answer -ne "si") { Write-Host "Annullato."; exit 1 }
}

if ($Copia) {
  Write-Host "1) Fermo app, worker e proxy…"
  Invoke-Compose $EnvFile @("stop", "app", "worker", "proxy")
  $production = $vars["PH_DB"] -eq "practicehub_prod"
  foreach ($db in @($vars["PH_DB"], "$($vars["PH_DB"])_legacy")) {
    $list = & docker compose -f $ComposeFile --env-file $EnvFile exec -T backup sh -c "ls -1 /backups/$Copia"
    $folder = $list | Where-Object { $_ -match ("^" + [regex]::Escape($db) + "_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$") } | Select-Object -First 1
    if (-not $folder) { throw "nessuna copia di $db in /backups/$Copia" }
    Write-Host "2) Ripristino di $db da $folder…"
    $cmd = @("exec", "-T", "backup", "node", "ops/backup-db.mjs", "restore", "--from", "/backups/$Copia/$folder", "--uri", $MongoUri, "--db", $db, "--drop", "--yes", "--dir", "/backups")
    if ($production) { $cmd += "--consenti-esercizio" }
    Invoke-Compose $EnvFile $cmd
  }
}

Write-Host "3) PH_TAG=$Etichetta e riavvio…"
Copy-Item $EnvFile "$EnvFile.prima-ritorno-$Etichetta" -Force
Set-DeployTag $EnvFile $Etichetta
Invoke-Compose $EnvFile @("up", "-d")
Wait-Healthy $EnvFile @("app", "proxy")
Write-DeployLog "Tornato $current → $Etichetta$(if ($Copia) { "; dati ripristinati da $Copia" } else { "; dati invariati" })"
