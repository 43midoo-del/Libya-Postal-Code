Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 256, 256
for ($y = 0; $y -lt 256; $y++) {
    $t = $y / 255.0
    $r = [int](8 + 18 * (1 - $t))
    $g = [int](28 + 55 * (1 - $t))
    $b = [int](58 + 95 * (1 - $t))
    $col = [System.Drawing.Color]::FromArgb($r, $g, $b)
    for ($x = 0; $x -lt 256; $x++) {
        $bmp.SetPixel($x, $y, $col)
    }
}
$out = Join-Path $PSScriptRoot '..\data\tiles\sea-sat-256.png'
$dir = Split-Path $out -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output ((Get-Item $out).Length)
