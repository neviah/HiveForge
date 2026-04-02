$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$rawDir = Join-Path $repoRoot "hiveforge/ui/dashboard/assets/imports/raw"
$metroOut = Join-Path $repoRoot "hiveforge/ui/dashboard/assets/sprites/metrocity"
$interiorOut = Join-Path $repoRoot "hiveforge/ui/dashboard/assets/tiles/interior"

if (-not (Test-Path $rawDir)) {
  throw "Raw import directory not found: $rawDir"
}

$sevenZip = (Get-Command 7z -ErrorAction SilentlyContinue).Source
if (-not $sevenZip) {
  throw "7z not found in PATH. Install 7-Zip CLI or add it to PATH."
}

$archives = @(
  @{ Name = "MetroCity.rar"; Out = $metroOut },
  @{ Name = "MetroCity 2.0.rar"; Out = $metroOut },
  @{ Name = "Interior.rar"; Out = $interiorOut }
)

foreach ($entry in $archives) {
  $archivePath = Join-Path $rawDir $entry.Name
  if (-not (Test-Path $archivePath)) {
    Write-Host "Skipping missing archive: $($entry.Name)"
    continue
  }

  New-Item -ItemType Directory -Force -Path $entry.Out | Out-Null
  Write-Host "Extracting $($entry.Name) -> $($entry.Out)"
  & $sevenZip x "-o$($entry.Out)" -y $archivePath | Out-Null
}

Write-Host "Done."
