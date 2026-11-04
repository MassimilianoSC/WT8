<#
  PracticeHub — controllo esterno a Docker (K5, PR-16, D-162, D-163).

  Avviato ogni 10 minuti dall'Utilità di pianificazione di Windows (deploy/README.md), anche senza utenti collegati.
  - Interroga GET <PH_PUBLIC_URL>/api/health. Il certificato autofirmato è accettato SOLO dentro questo script
    (nessuna modifica alla configurazione di Windows); se ne legge la scadenza.
  - Problemi: app che non risponde (Docker, app o proxy fermi), database fermo, worker fermo, orologio sbagliato,
    copia notturna fallita o vecchia, disco delle copie quasi pieno, certificato in scadenza (meno di 30 giorni) e
    spazio libero del disco di sistema (C:) sotto PH_DISK_C_MIN_FREE_GB (default 20): dal container non si vede.
  - Una mail all'INIZIO di ogni problema e una quando è RISOLTO, non una a ogni giro: lo stato sta in
    controllo-stato.json accanto allo script. Se la mail non parte, si riprova al giro dopo.
  - Destinatari (PH_ALERT_TO, separati da virgola o punto e virgola), posta (SMTP_*) e indirizzo (PH_PUBLIC_URL) da
    deploy/.env: nessun segreto nel repository. Senza SMTP_HOST la mail finisce solo nel registro controllo.log.
#>
param(
  [string]$EnvFile = (Join-Path $PSScriptRoot "..\.env"),
  [string]$StateFile = (Join-Path $PSScriptRoot "controllo-stato.json"),
  [string]$LogFile = (Join-Path $PSScriptRoot "controllo.log"),
  [int]$TimeoutSec = 20,
  [int]$CertWarnDays = 30
)

$ErrorActionPreference = "Stop"

function Write-Log([string]$msg) {
  if ((Test-Path $LogFile) -and ((Get-Item $LogFile).Length -gt 1MB)) { Move-Item $LogFile "$LogFile.1" -Force }
  Add-Content -Path $LogFile -Value ("{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg) -Encoding UTF8
}

function Read-EnvFile([string]$path) {
  $vars = @{}
  foreach ($line in Get-Content -Path $path -Encoding UTF8) {
    if ($line -match '^\s*#' -or $line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') { continue }
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $vars[$Matches[1]] = $value
  }
  return $vars
}

# Validazione del certificato solo per questa richiesta: accetta l'autofirmato e ne ricorda la scadenza.
Add-Type -TypeDefinition @"
using System;
using System.Net;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
public static class PhCertificato {
  public static DateTime? Scadenza;
  public static bool Accetta(object s, X509Certificate c, X509Chain ch, SslPolicyErrors e) {
    if (c != null) { Scadenza = new X509Certificate2(c).NotAfter; }
    return true;
  }
}
"@

function Get-Health([string]$url) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $req = [System.Net.HttpWebRequest]::Create($url)
  $req.Timeout = $TimeoutSec * 1000
  $req.ReadWriteTimeout = $TimeoutSec * 1000
  $req.ServerCertificateValidationCallback = [System.Net.Security.RemoteCertificateValidationCallback] [PhCertificato].GetMethod("Accetta").CreateDelegate([System.Net.Security.RemoteCertificateValidationCallback])
  try {
    $resp = $req.GetResponse()
  } catch [System.Net.WebException] {
    if ($_.Exception.Response) { $resp = $_.Exception.Response } else { return @{ reachable = $false; error = $_.Exception.Message } }
  }
  try {
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream(), [System.Text.Encoding]::UTF8)
    $body = $reader.ReadToEnd()
    return @{ reachable = $true; status = [int]$resp.StatusCode; body = $body }
  } finally {
    $resp.Close()
  }
}

function Send-Alert($vars, [string]$subject, [string]$body) {
  $to = @(($vars["PH_ALERT_TO"] -split '[,;]') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if (-not $vars["SMTP_HOST"] -or $to.Count -eq 0) {
    Write-Log "MAIL NON INVIATA (SMTP_HOST o PH_ALERT_TO vuoti) — $subject`n$body"
    return $true
  }
  $from = if ($vars["SMTP_FROM"]) { $vars["SMTP_FROM"] } else { $vars["SMTP_USER"] }
  $msg = New-Object System.Net.Mail.MailMessage
  $msg.From = New-Object System.Net.Mail.MailAddress($(if ($from -match '<([^>]+)>') { $Matches[1] } else { $from }), "PracticeHub")
  foreach ($t in $to) { $msg.To.Add($t) }
  $msg.Subject = $subject
  $msg.Body = $body
  $msg.BodyEncoding = [System.Text.Encoding]::UTF8
  $msg.SubjectEncoding = [System.Text.Encoding]::UTF8
  $port = if ($vars["SMTP_PORT"]) { [int]$vars["SMTP_PORT"] } else { 587 }
  $smtp = New-Object System.Net.Mail.SmtpClient($vars["SMTP_HOST"], $port)
  # 587: STARTTLS (EnableSsl). La porta 465 (TLS implicito) non è supportata da SmtpClient.
  $smtp.EnableSsl = ($vars["SMTP_SECURE"] -eq "true") -or ($port -eq 587)
  if ($vars["SMTP_USER"]) { $smtp.Credentials = New-Object System.Net.NetworkCredential($vars["SMTP_USER"], $vars["SMTP_PASSWORD"]) }
  try {
    $smtp.Send($msg)
    Write-Log "Mail inviata a $($to -join ', '): $subject"
    return $true
  } catch {
    Write-Log "ERRORE invio mail ($subject): $($_.Exception.Message)"
    return $false
  } finally {
    $msg.Dispose(); $smtp.Dispose()
  }
}

try {
  if (-not (Test-Path $EnvFile)) { throw "File di configurazione non trovato: $EnvFile" }
  $vars = Read-EnvFile $EnvFile
  if (-not $vars["PH_PUBLIC_URL"]) { throw "PH_PUBLIC_URL mancante in $EnvFile" }
  $url = $vars["PH_PUBLIC_URL"].TrimEnd("/") + "/api/health"

  # Problemi attuali: chiave → descrizione.
  $problems = [ordered]@{}
  $h = Get-Health $url
  if (-not $h.reachable) {
    $problems["app"] = "L'app non risponde su $url ($($h.error)). Possibili cause: Docker fermo, container app o proxy fermi, PC in riavvio."
  } else {
    $report = $null
    try { $report = $h.body | ConvertFrom-Json } catch { }
    if ($h.status -eq 503) { $problems["database"] = "Il database non risponde (l'app è raggiungibile)." }
    elseif ($h.status -ne 200 -or -not $report) { $problems["app"] = "Risposta inattesa da $url (HTTP $($h.status))." }
    else {
      foreach ($p in $report.checks.PSObject.Properties) {
        if (-not $p.Value.ok) { $problems[$p.Name] = "$($p.Name): $($p.Value.detail)" }
      }
    }
    if ([PhCertificato]::Scadenza) {
      $days = ([PhCertificato]::Scadenza - (Get-Date)).TotalDays
      if ($days -lt $CertWarnDays) {
        $problems["certificato"] = "Il certificato HTTPS scade il $([PhCertificato]::Scadenza.ToString('dd/MM/yyyy')) (fra $([math]::Floor($days)) giorni): rinnovarlo (deploy/README.md, sezione HTTPS)."
      }
    }
  }

  # Disco di sistema (PR-17a): misurato qui perché dal container non si vede; sempre, anche con l'app ferma.
  $minC = if ($vars["PH_DISK_C_MIN_FREE_GB"]) { [double]$vars["PH_DISK_C_MIN_FREE_GB"] } else { 20 }
  $sys = New-Object System.IO.DriveInfo($env:SystemDrive)
  $freeGb = [math]::Round($sys.AvailableFreeSpace / 1GB, 1)
  if ($freeGb -lt $minC) {
    $problems["disco-sistema"] = "Disco di sistema $($env:SystemDrive) quasi pieno: $freeGb GB liberi su $([math]::Round($sys.TotalSize / 1GB)) GB (soglia $minC GB). Con il disco di sistema pieno Windows, gli aggiornamenti e Docker possono bloccarsi."
  }

  # Stato precedente: chiave → { since, detail }.
  $state = @{}
  if (Test-Path $StateFile) {
    $saved = Get-Content -Path $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($p in $saved.PSObject.Properties) { $state[$p.Name] = @{ since = $p.Value.since; detail = $p.Value.detail } }
  }

  # Con app o database fermi gli altri controlli non si possono leggere: i problemi già aperti restano aperti
  # (niente "Risolto" falso) finché non si possono verificare di nuovo.
  if ($problems.Contains("app") -or $problems.Contains("database")) {
    foreach ($k in @($state.Keys)) {
      if (-not $problems.Contains($k) -and $k -ne "app" -and $k -ne "database" -and $k -ne "disco-sistema") { $problems[$k] = $state[$k].detail }
    }
  }

  $new = @($problems.Keys | Where-Object { -not $state.ContainsKey($_) })
  $solved = @($state.Keys | Where-Object { -not $problems.Contains($_) })
  $machine = $env:COMPUTERNAME
  $now = Get-Date -Format "dd/MM/yyyy HH:mm"

  if ($new.Count -gt 0) {
    $lines = $new | ForEach-Object { "- $($problems[$_])" }
    $body = "PracticeHub su $machine, controllo delle $now`n`nProblemi nuovi:`n$($lines -join "`n")`n`nIndirizzo controllato: $url`nUn'altra mail arriverà quando saranno risolti."
    if (Send-Alert $vars "[PracticeHub] Guasto: $($new -join ', ')" $body) {
      foreach ($k in $new) { $state[$k] = @{ since = (Get-Date).ToString("o"); detail = $problems[$k] } }
    }
  }
  if ($solved.Count -gt 0) {
    $lines = $solved | ForEach-Object { "- $_ (dal $(([datetime]$state[$_].since).ToString('dd/MM/yyyy HH:mm')))" }
    $body = "PracticeHub su $machine, controllo delle $now`n`nRisolti:`n$($lines -join "`n")"
    if (Send-Alert $vars "[PracticeHub] Risolto: $($solved -join ', ')" $body) {
      foreach ($k in $solved) { $state.Remove($k) }
    }
  }

  $state | ConvertTo-Json -Depth 4 | Set-Content -Path $StateFile -Encoding UTF8
  Write-Log ("Controllo: " + $(if ($problems.Count) { "problemi: $($problems.Keys -join ', ')" } else { "tutto in ordine" }))
} catch {
  Write-Log "ERRORE del controllo: $($_.Exception.Message)"
  exit 1
}
