param(
  [Parameter(Mandatory = $true)]
  [string]$Source,
  [string]$Target = (Join-Path $PSScriptRoot "..\icons\prod")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$targetPath = [IO.Path]::GetFullPath($Target)
if (-not (Test-Path -LiteralPath $targetPath -PathType Container)) {
  throw "Icon target does not exist: $targetPath"
}

function New-IconPng([Drawing.Image]$image, [int]$dimension) {
  if ($dimension -lt 1) {
    throw "Icon size must be positive: $dimension"
  }
  $side = [Math]::Min($image.Width, $image.Height)
  $cropX = [int](($image.Width - $side) / 2)
  $cropY = [int](($image.Height - $side) / 2)
  $bitmap = [Drawing.Bitmap]::new($dimension, $dimension, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([Drawing.Color]::White)
    $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage(
      $image,
      [Drawing.Rectangle]::new(0, 0, $dimension, $dimension),
      $cropX,
      $cropY,
      $side,
      $side,
      [Drawing.GraphicsUnit]::Pixel
    )

    $stream = [IO.MemoryStream]::new()
    try {
      $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
      return ,$stream.ToArray()
    } finally {
      $stream.Dispose()
    }
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Write-BigEndianUInt32([IO.BinaryWriter]$writer, [uint32]$value) {
  $writer.Write([byte[]]@(
    [byte](($value -shr 24) -band 0xff)
    [byte](($value -shr 16) -band 0xff)
    [byte](($value -shr 8) -band 0xff)
    [byte]($value -band 0xff)
  ))
}

function Write-Ico([string]$path, [Drawing.Image]$image) {
  $entries = @(16, 24, 32, 48, 64, 128, 256) | ForEach-Object {
    [pscustomobject]@{ Dimension = $_; Bytes = New-IconPng -image $image -dimension ([int]$_) }
  }
  $stream = [IO.File]::Create($path)
  $writer = [IO.BinaryWriter]::new($stream)
  try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$entries.Count)
    $offset = 6 + (16 * $entries.Count)
    foreach ($entry in $entries) {
      $writer.Write([byte]$(if ($entry.Dimension -eq 256) { 0 } else { $entry.Dimension }))
      $writer.Write([byte]$(if ($entry.Dimension -eq 256) { 0 } else { $entry.Dimension }))
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$entry.Bytes.Length)
      $writer.Write([uint32]$offset)
      $offset += $entry.Bytes.Length
    }
    foreach ($entry in $entries) {
      $writer.Write($entry.Bytes)
    }
  } finally {
    $writer.Dispose()
    $stream.Dispose()
  }
}

function Write-Icns([string]$path, [Drawing.Image]$image) {
  $entries = @(
    @{ Type = "icp4"; Size = 16 },
    @{ Type = "icp5"; Size = 32 },
    @{ Type = "icp6"; Size = 64 },
    @{ Type = "ic07"; Size = 128 },
    @{ Type = "ic08"; Size = 256 },
    @{ Type = "ic09"; Size = 512 },
    @{ Type = "ic10"; Size = 1024 }
  ) | ForEach-Object {
    [pscustomobject]@{ Type = $_.Type; Bytes = New-IconPng -image $image -dimension ([int]$_['Size']) }
  }
  $total = 8
  foreach ($entry in $entries) {
    $total += 8 + $entry.Bytes.Length
  }
  $stream = [IO.File]::Create($path)
  $writer = [IO.BinaryWriter]::new($stream)
  try {
    $writer.Write([Text.Encoding]::ASCII.GetBytes("icns"))
    Write-BigEndianUInt32 $writer $total
    foreach ($entry in $entries) {
      $writer.Write([Text.Encoding]::ASCII.GetBytes($entry.Type))
      Write-BigEndianUInt32 $writer (8 + $entry.Bytes.Length)
      $writer.Write($entry.Bytes)
    }
  } finally {
    $writer.Dispose()
    $stream.Dispose()
  }
}

$image = [Drawing.Image]::FromFile($sourcePath)
try {
  $pngTargets = Get-ChildItem -LiteralPath $targetPath -File -Filter "*.png" | ForEach-Object {
    $current = [Drawing.Image]::FromFile($_.FullName)
    try {
      [pscustomobject]@{ Path = $_.FullName; Dimension = [Math]::Max($current.Width, $current.Height) }
    } finally {
      $current.Dispose()
    }
  }
  foreach ($pngTarget in $pngTargets) {
    [IO.File]::WriteAllBytes(
      $pngTarget.Path,
      (New-IconPng -image $image -dimension ([int]$pngTarget.Dimension))
    )
  }
  Write-Ico (Join-Path $targetPath "icon.ico") $image
  Write-Icns (Join-Path $targetPath "icon.icns") $image

  $repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
  $faviconTargets = @((Join-Path $repoRoot "packages\ui\src\assets\favicon"))
  foreach ($faviconTarget in $faviconTargets) {
    Get-ChildItem -LiteralPath $faviconTarget -File -Filter "*.png" | ForEach-Object {
      $current = [Drawing.Image]::FromFile($_.FullName)
      try {
        $dimension = [Math]::Max($current.Width, $current.Height)
      } finally {
        $current.Dispose()
      }
      [IO.File]::WriteAllBytes($_.FullName, (New-IconPng -image $image -dimension $dimension))
    }
    Get-ChildItem -LiteralPath $faviconTarget -File -Filter "*.ico" | ForEach-Object {
      Write-Ico $_.FullName $image
    }
  }
} finally {
  $image.Dispose()
}

Write-Host "Generated NovelX desktop icons in $targetPath"
