param(
  [int]$Port = 8799,
  [switch]$NoOpen
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-PythonLauncher {
  if (Get-Command python -ErrorAction SilentlyContinue) { return "python" }
  if (Get-Command py -ErrorAction SilentlyContinue) { return "py" }
  throw "Python was not found. Install Python 3 to run a local web server."
}

$root = (Resolve-Path $PSScriptRoot).Path
$python = Get-PythonLauncher
$args = if ($python -eq "py") { @("-3", "-m", "http.server", "$Port", "--bind", "127.0.0.1") } else { @("-m", "http.server", "$Port", "--bind", "127.0.0.1") }

Write-Host "Starting local server: http://127.0.0.1:$Port/index.html" -ForegroundColor Cyan

$proc = Start-Process -FilePath $python -ArgumentList $args -WorkingDirectory $root -PassThru
try {
  if (-not $NoOpen) {
    Start-Sleep -Milliseconds 300
    Start-Process "http://127.0.0.1:$Port/index.html" | Out-Null
  }
  Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
  Wait-Process -Id $proc.Id
}
finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
}

