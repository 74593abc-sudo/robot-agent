Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile("$PWD\_desktop_check.png")
# crop bottom-right 280x300
$cw=280; $ch=300
$cx=$src.Width-$cw; $cy=$src.Height-$ch
$crop = New-Object System.Drawing.Bitmap $cw,$ch
$g=[System.Drawing.Graphics]::FromImage($crop)
$g.DrawImage($src, (New-Object System.Drawing.Rectangle 0,0,$cw,$ch), (New-Object System.Drawing.Rectangle $cx,$cy,$cw,$ch), [System.Drawing.GraphicsUnit]::Pixel)
$crop.Save("$PWD\_corner_check.png")
$g.Dispose();$crop.Dispose();$src.Dispose()
Write-Output "cropped"
