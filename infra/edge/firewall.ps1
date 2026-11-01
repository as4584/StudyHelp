# Opens ONLY the media-edge ports in Windows Defender Firewall. Run once, as Administrator:
#   powershell -ExecutionPolicy Bypass -File infra\edge\firewall.ps1          # add rules
#   powershell -ExecutionPolicy Bypass -File infra\edge\firewall.ps1 -Remove  # undo
param([switch]$Remove)
$ErrorActionPreference = "Stop"
$rules = @(
  @{ Name = "GSHT edge HTTP (ACME)";   Protocol = "TCP"; Port = 80 },
  @{ Name = "GSHT edge HTTPS+TURN/TLS"; Protocol = "TCP"; Port = 443 },
  @{ Name = "GSHT LiveKit ICE/TCP";    Protocol = "TCP"; Port = 7881 },
  @{ Name = "GSHT LiveKit media UDP";  Protocol = "UDP"; Port = 7882 },
  @{ Name = "GSHT LiveKit TURN/UDP";   Protocol = "UDP"; Port = 3478 }
)
foreach ($r in $rules) {
  Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  if (-not $Remove) {
    New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Action Allow -Profile Private,Public `
      -Protocol $r.Protocol -LocalPort $r.Port | Out-Null
    Write-Host "allowed $($r.Protocol) $($r.Port)  ($($r.Name))"
  } else { Write-Host "removed $($r.Name)" }
}
