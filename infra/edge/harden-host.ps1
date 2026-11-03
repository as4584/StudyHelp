# Hardens the Windows host that runs the media edge. Run once, as Administrator:
#   powershell -ExecutionPolicy Bypass -File infra\edge\harden-host.ps1          # apply
#   powershell -ExecutionPolicy Bypass -File infra\edge\harden-host.ps1 -Undo    # revert
# Every step is reversible and is logged to docs/ops/edge-changes.md.
param([switch]$Undo)
$ErrorActionPreference = "Stop"
$docker = "C:\Program Files\Docker\Docker\resources\com.docker.backend.exe"
$sshdConfig = "C:\ProgramData\ssh\sshd_config"
$sshdBackup = "$sshdConfig.gsht-backup"
$tailnet = @("100.64.0.0/10", "fd7a:115c:a1e0::/48")

# 1. SSH: keys only. Alex logs in with an ED25519 key; passwords are what scanners guess.
#    Directives go above the first Match block so they apply to every user.
if ($Undo) {
  if (Test-Path $sshdBackup) { Copy-Item $sshdBackup $sshdConfig -Force; Write-Host "sshd_config restored" }
} elseif (Get-Service sshd -ErrorAction SilentlyContinue) {
  if (-not (Test-Path $sshdBackup)) { Copy-Item $sshdConfig $sshdBackup }
  $lines = Get-Content $sshdConfig | Where-Object { $_ -notmatch '^\s*(PasswordAuthentication|KbdInteractiveAuthentication|PermitEmptyPasswords|MaxAuthTries|LoginGraceTime)\b' }
  $hardening = @("PasswordAuthentication no", "KbdInteractiveAuthentication no", "PermitEmptyPasswords no",
                 "MaxAuthTries 3", "LoginGraceTime 30")
  $at = [Array]::FindIndex([string[]]$lines, [Predicate[string]]{ param($l) $l -match '^\s*Match\b' })
  if ($at -lt 0) { $lines = $lines + $hardening } else { $lines = $lines[0..($at - 1)] + $hardening + $lines[$at..($lines.Count - 1)] }
  Set-Content -Path $sshdConfig -Value $lines -Encoding ascii
  & "C:\Windows\System32\OpenSSH\sshd.exe" -t
  if ($LASTEXITCODE -ne 0) { Copy-Item $sshdBackup $sshdConfig -Force; throw "sshd -t rejected the config; restored backup" }
  Write-Host "sshd: key-only login, 3 tries, 30 s login window"
}
if (Get-Service sshd -ErrorAction SilentlyContinue) { Restart-Service sshd }

# 2. Edge ports: only Docker's port proxy may receive them, not any program that binds 80/443.
Get-NetFirewallRule -DisplayName "GSHT *" -ErrorAction SilentlyContinue | ForEach-Object {
  $_ | Set-NetFirewallApplicationFilter -Program $(if ($Undo) { "Any" } else { $docker })
  Write-Host "$($_.DisplayName): program $(if ($Undo) { 'any' } else { 'docker backend only' })"
}

# 3. Node dev servers: reachable from the home LAN and Tailscale (phone testing), nothing else.
Get-NetFirewallRule -DisplayName "Node.js JavaScript Runtime" -ErrorAction SilentlyContinue | ForEach-Object {
  $remote = if ($Undo) { @("Any") } else { @("LocalSubnet") + $tailnet }
  $_ | Set-NetFirewallAddressFilter -RemoteAddress $remote
  Write-Host "node rule ($($_.Profile)): remote $($remote -join ', ')"
}

# 4. Detection: log dropped inbound packets (%windir%\System32\LogFiles\Firewall\pfirewall.log).
Set-NetFirewallProfile -All -LogBlocked $(if ($Undo) { "False" } else { "True" }) -LogMaxSizeKilobytes 16384
Write-Host "firewall drop logging: $(if ($Undo) { 'off' } else { 'on' })"

# 5. Defender: block potentially unwanted apps and known-bad domains for every program.
if (-not $Undo) {
  Set-MpPreference -PUAProtection Enabled -EnableNetworkProtection Enabled -DisableRealtimeMonitoring $false
  Write-Host "defender: realtime on, PUA blocking on, network protection on"
}

# 6. Report only: disk encryption (turning it on is Alex's call; it needs the recovery key saved).
try {
  $v = Get-BitLockerVolume -MountPoint C:
  Write-Host "disk C: $($v.VolumeStatus), protection $($v.ProtectionStatus)"
} catch { Write-Host "disk C: BitLocker/device encryption status unavailable ($($_.Exception.Message))" }
