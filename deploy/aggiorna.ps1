<#
  PracticeHub — aggiornamento con possibilità di tornare indietro (K6, PR-26).

    powershell -ExecutionPolicy Bypass -File deploy\aggiorna.ps1 -Etichetta 2026-10-15a

  1. copia verificata dei due database (in /backups/aggiornamenti/<data>_<etichetta-precedente>);
  2. build dell'immagine practicehub:<Etichetta> dal repository (salvo -SenzaBuild, se l'immagine c'è già);
  3. PH_TAG=<Etichetta> in deploy/.env (il .env precedente resta in .env.prima-<Etichetta>);
  4. riavvio dei servizi con la nuova immagine e attesa di app e proxy "healthy";
  5. riga in deploy/aggiornamenti.log con l'etichetta precedente e la cartella della copia.
  Se qualcosa va storto stampa il comando per tornare indietro (deploy/torna-indietro.ps1). Non migra i dati: se
  la versione nuova richiede una migrazione, l'app non parte finché non la si esegue (PR-27).
#>
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$')][string]$Etichetta,
  [string]$EnvFile = "",
  [switch]$SenzaBuild,
  [switch]$Si
)
# Windows PowerShell 5.1 con -File: $PSScriptRoot è vuoto nei valori predefiniti di param(); si calcola qui.
$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $EnvFile) { $EnvFile = Join-Path $here ".env" }
. (Join-Path $here "lib-deploy.ps1")

$vars = Read-DeployEnv $EnvFile
$old = $vars["PH_TAG"]
if ($old -eq $Etichetta) { throw "PH_TAG è già $Etichetta" }
Write-Host "Aggiornamento di $($vars["PH_PROJECT"]) ($($vars["PH_DB"])): practicehub:$old → practicehub:$Etichetta"
if (-not $Si) {
  $answer = Read-Host "Procedere? (si/no)"
  if ($answer -ne "si") { Write-Host "Annullato."; exit 1 }
}

$name = "{0}_{1}" -f (Get-Date -Format "yyyy-MM-dd_HH-mm-ss"), $old
Write-Host "1) Copia dei dati prima dell'aggiornamento…"
$copy = New-UpdateCopy $EnvFile $vars $name

if (-not $SenzaBuild) {
  Write-Host "2) Build di practicehub:$Etichetta…"
  & docker build -t "practicehub:$Etichetta" (Join-Path $DeployDir "..\frontend")
  if ($LASTEXITCODE -ne 0) { throw "build non riuscita: nulla è cambiato (PH_TAG resta $old)" }
} else {
  if (-not (Test-DockerImage "practicehub:$Etichetta")) { throw "immagine practicehub:$Etichetta assente: togliere -SenzaBuild oppure costruirla prima" }
}

Write-Host "3) PH_TAG=$Etichetta in $EnvFile…"
Copy-Item $EnvFile "$EnvFile.prima-$Etichetta" -Force
Set-DeployTag $EnvFile $Etichetta

try {
  Write-Host "4) Riavvio con la nuova immagine…"
  Invoke-Compose $EnvFile @("up", "-d")
  Wait-Healthy $EnvFile @("app", "proxy")
} catch {
  Write-DeployLog "AGGIORNAMENTO NON RIUSCITO $old → $Etichetta ($($_.Exception.Message)); copia: $copy"
  Write-Host ""
  Write-Host "Per tornare indietro:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File deploy\torna-indietro.ps1 -Etichetta $old -Copia aggiornamenti/$name"
  exit 1
}
Write-DeployLog "Aggiornato $old → $Etichetta; copia prima dell'aggiornamento: $copy"
Write-Host ""
Write-Host "Fatto. Per tornare indietro, se servisse:"
Write-Host "  powershell -ExecutionPolicy Bypass -File deploy\torna-indietro.ps1 -Etichetta $old -Copia aggiornamenti/$name"
