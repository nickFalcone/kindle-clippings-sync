# Copy the Windows Kindle helper into %USERPROFILE%\Kindle.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $env:USERPROFILE 'Kindle'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Force (Join-Path $here 'kindle-sync.ps1') $dest
Copy-Item -Force (Join-Path $here 'kindle-sync.cmd') $dest

Write-Host "Installed Windows helper to $dest"
Write-Host ""
Write-Host "In Obsidian (Windows) -> Settings -> Kindle Clippings Sync:"
Write-Host ""
Write-Host "  Path to My Clippings.txt:"
Write-Host "    %USERPROFILE%\Kindle\My Clippings.txt"
Write-Host ""
Write-Host "  Pre-sync command:"
Write-Host '    "%USERPROFILE%\Kindle\kindle-sync.cmd"'
Write-Host ""
Write-Host "Those two settings are stored per computer; your Mac paths stay as they are."
Write-Host "Reload Obsidian (Ctrl+R) if you just deployed a new build, then sync once"
Write-Host "and approve the pre-sync command when asked."
