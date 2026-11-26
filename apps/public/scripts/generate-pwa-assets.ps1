Add-Type -AssemblyName System.Drawing

$publicDir = "C:\Users\HP\Documents\YCT Alert\apps\public\public"
$iconsDir = Join-Path $publicDir "icons"
if (-not (Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null
}

$src = "C:\Users\HP\Documents\YCT Alert\apps\public\android\app\src\main\res\mipmap-xxxhdpi\ic_launcher.png"
if (Test-Path $src) {
    $img = [System.Drawing.Image]::FromFile($src)
    
    # 192x192
    $bmp192 = New-Object System.Drawing.Bitmap 192, 192
    $g192 = [System.Drawing.Graphics]::FromImage($bmp192)
    $g192.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g192.DrawImage($img, 0, 0, 192, 192)
    $bmp192.Save((Join-Path $iconsDir "icon-192.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g192.Dispose()
    $bmp192.Dispose()

    # 512x512
    $bmp512 = New-Object System.Drawing.Bitmap 512, 512
    $g512 = [System.Drawing.Graphics]::FromImage($bmp512)
    $g512.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g512.DrawImage($img, 0, 0, 512, 512)
    $bmp512.Save((Join-Path $iconsDir "icon-512.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g512.Dispose()
    $bmp512.Dispose()

    # Maskable 192x192 with #174b32 background
    $bmpMask192 = New-Object System.Drawing.Bitmap 192, 192
    $gMask192 = [System.Drawing.Graphics]::FromImage($bmpMask192)
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#174b32'))
    $gMask192.FillRectangle($brush, 0, 0, 192, 192)
    $gMask192.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gMask192.DrawImage($img, 19, 19, 154, 154)
    $bmpMask192.Save((Join-Path $iconsDir "icon-192-maskable.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $gMask192.Dispose()
    $bmpMask192.Dispose()

    # Maskable 512x512 with #174b32 background
    $bmpMask512 = New-Object System.Drawing.Bitmap 512, 512
    $gMask512 = [System.Drawing.Graphics]::FromImage($bmpMask512)
    $gMask512.FillRectangle($brush, 0, 0, 512, 512)
    $gMask512.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gMask512.DrawImage($img, 51, 51, 410, 410)
    $bmpMask512.Save((Join-Path $iconsDir "icon-512-maskable.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $gMask512.Dispose()
    $bmpMask512.Dispose()

    $brush.Dispose()
    $img.Dispose()
    Write-Host "PWA icons generated successfully."
}

$favSrc = "C:\Users\HP\Documents\YCT Alert\docs\preparation\yct-map-brand-assets\favicon.svg"
if (Test-Path $favSrc) {
    Copy-Item $favSrc -Destination (Join-Path $iconsDir "favicon.svg")
    Copy-Item $favSrc -Destination (Join-Path $publicDir "favicon.svg")
}
