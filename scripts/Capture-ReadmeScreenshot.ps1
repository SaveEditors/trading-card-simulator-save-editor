param(
  [int]$Port = 8799,
  [string]$Output = "assets/readme-screenshot-app.png"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-PythonLauncher {
  if (Get-Command python -ErrorAction SilentlyContinue) { return "python" }
  if (Get-Command py -ErrorAction SilentlyContinue) { return "py" }
  throw "Python was not found. Install Python 3 to capture screenshots."
}

function Get-BrowserPath {
  $paths = @(
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  )
  foreach ($path in $paths) {
    if (Test-Path $path) { return $path }
  }
  throw "No supported browser found (Edge or Chrome)."
}

function Test-PortAvailable {
  param([int]$CandidatePort)
  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $CandidatePort)
    $listener.Start()
    return $true
  }
  catch {
    return $false
  }
  finally {
    if ($listener) { $listener.Stop() }
  }
}

function Get-FreePort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), 0)
  $listener.Start()
  try {
    return $listener.LocalEndpoint.Port
  }
  finally {
    $listener.Stop()
  }
}

function Resolve-ServerPort {
  param([int]$PreferredPort)

  if ($PreferredPort -gt 0 -and (Test-PortAvailable -CandidatePort $PreferredPort)) {
    return $PreferredPort
  }

  $fallback = Get-FreePort
  if ($PreferredPort -gt 0) {
    Write-Warning "Port $PreferredPort is not available. Using free port $fallback instead."
  }
  return $fallback
}

function Wait-ServerReady {
  param(
    [string]$Url,
    [System.Diagnostics.Process]$Process,
    [int]$TimeoutSeconds = 20
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($Process.HasExited) {
      throw "Local server exited before it became ready."
    }

    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400 -and $response.Content -match "<title>Trading Card Shop Simulator - Save Editor</title>") {
        return
      }
    }
    catch {
      # Retry until timeout.
    }
    Start-Sleep -Milliseconds 500
  }

  throw "Timed out waiting for local server at $Url"
}

function Trim-WhiteBottomBorder {
  param(
    [string]$ImagePath,
    [int]$WhiteThreshold = 245,
    [double]$RowWhiteRatio = 0.985,
    [double]$ColumnWhiteRatio = 0.985,
    [int]$SampleStep = 4,
    [int]$MinHeight = 420,
    [int]$MinWidth = 1000
  )

  Add-Type -AssemblyName System.Drawing
  $bitmap = $null
  $cropped = $null
  $tempPath = "$ImagePath.tmp.png"
  try {
    $bitmap = [System.Drawing.Bitmap]::FromFile($ImagePath)
    $width = $bitmap.Width
    $height = $bitmap.Height
    $trimRows = 0
    $trimCols = 0

    for ($y = $height - 1; $y -ge 0; $y--) {
      $samples = 0
      $whiteSamples = 0
      for ($x = 0; $x -lt $width; $x += $SampleStep) {
        $pixel = $bitmap.GetPixel($x, $y)
        $samples++
        if ($pixel.R -ge $WhiteThreshold -and $pixel.G -ge $WhiteThreshold -and $pixel.B -ge $WhiteThreshold) {
          $whiteSamples++
        }
      }

      if ($samples -eq 0) { break }
      $ratio = $whiteSamples / $samples
      if ($ratio -ge $RowWhiteRatio) {
        $trimRows++
      } else {
        break
      }
    }

    $newHeight = $height - $trimRows
    if ($newHeight -lt $MinHeight) {
      $newHeight = $height
      $trimRows = 0
    }

    for ($x = $width - 1; $x -ge 0; $x--) {
      $samples = 0
      $whiteSamples = 0
      for ($y = 0; $y -lt $newHeight; $y += $SampleStep) {
        $pixel = $bitmap.GetPixel($x, $y)
        $samples++
        if ($pixel.R -ge $WhiteThreshold -and $pixel.G -ge $WhiteThreshold -and $pixel.B -ge $WhiteThreshold) {
          $whiteSamples++
        }
      }

      if ($samples -eq 0) { break }
      $ratio = $whiteSamples / $samples
      if ($ratio -ge $ColumnWhiteRatio) {
        $trimCols++
      } else {
        break
      }
    }

    $newWidth = $width - $trimCols
    if ($newWidth -lt $MinWidth) {
      $newWidth = $width
      $trimCols = 0
    }

    if (($trimRows -gt 0 -or $trimCols -gt 0) -and $newHeight -ge $MinHeight -and $newWidth -ge $MinWidth) {
      $rect = [System.Drawing.Rectangle]::new(0, 0, $newWidth, $newHeight)
      $cropped = $bitmap.Clone($rect, $bitmap.PixelFormat)
      $cropped.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
      $cropped.Dispose()
      $cropped = $null
      $bitmap.Dispose()
      $bitmap = $null
      Move-Item -Path $tempPath -Destination $ImagePath -Force
      return @{ Rows = $trimRows; Columns = $trimCols }
    }

    return @{ Rows = 0; Columns = 0 }
  }
  finally {
    if ($cropped) { $cropped.Dispose() }
    if ($bitmap) { $bitmap.Dispose() }
    if (Test-Path $tempPath) { Remove-Item -Path $tempPath -Force -ErrorAction SilentlyContinue }
  }
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$python = Get-PythonLauncher
$browser = Get-BrowserPath
$resolvedPort = Resolve-ServerPort -PreferredPort $Port
$outputPath = Join-Path $root $Output
$outputDir = Split-Path $outputPath -Parent
if (-not (Test-Path $outputDir)) { New-Item -Path $outputDir -ItemType Directory | Out-Null }

$serverArgs = if ($python -eq "py") {
  @("-3", "-m", "http.server", "$resolvedPort", "--bind", "127.0.0.1")
} else {
  @("-m", "http.server", "$resolvedPort", "--bind", "127.0.0.1")
}

$server = Start-Process -FilePath $python -ArgumentList $serverArgs -WorkingDirectory $root -PassThru -WindowStyle Hidden
try {
  $url = "http://127.0.0.1:$resolvedPort/index.html"
  Wait-ServerReady -Url $url -Process $server -TimeoutSeconds 20
  $shotArgs = @(
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--virtual-time-budget=4000",
    "--window-size=1600,760",
    "--screenshot=$outputPath",
    $url
  )
  & $browser @shotArgs | Out-Null
  if (-not (Test-Path $outputPath)) {
    throw "Screenshot capture failed: $outputPath was not created."
  }
  $trimResult = Trim-WhiteBottomBorder -ImagePath $outputPath
  if ($trimResult.Rows -gt 0 -or $trimResult.Columns -gt 0) {
    Write-Host "Trimmed white border from screenshot. Rows: $($trimResult.Rows), Columns: $($trimResult.Columns)." -ForegroundColor Yellow
  }
  Write-Host "Screenshot saved: $outputPath" -ForegroundColor Green
}
finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
  }
}

