# kindle-sync.ps1 — pull My Clippings.txt from a USB-connected Kindle (Windows).
#
# Newer Kindle firmware (5.16.2+) uses MTP instead of USB Mass Storage, so the
# device appears under This PC as a portable device, not a drive letter. This
# script copies My Clippings.txt to a local path for the Kindle Clippings Sync
# Obsidian plugin to import.
#
# Intended as the plugin's pre-sync command — Obsidian runs the sync itself
# after this script finishes. Pair with kindle-sync.cmd so the setting can be
# a single path: %USERPROFILE%\Kindle\kindle-sync.cmd
#
# Env:
#   KINDLE_CLIPPINGS_DEST     default %USERPROFILE%\Kindle\My Clippings.txt
#   KINDLE_DEVICE_ASINS_DEST  default <same folder>\device-asins.raw.json

$ErrorActionPreference = 'Stop'
trap {
	[Console]::Error.WriteLine($_.Exception.Message)
	exit 1
}

function Die([string]$Message) {
	throw "kindle-sync: $Message"
}

function Get-ClippingsDest {
	if ($env:KINDLE_CLIPPINGS_DEST) { return $env:KINDLE_CLIPPINGS_DEST }
	return Join-Path $env:USERPROFILE 'Kindle\My Clippings.txt'
}

function Get-AsinsDest([string]$ClippingsDest) {
	if ($env:KINDLE_DEVICE_ASINS_DEST) { return $env:KINDLE_DEVICE_ASINS_DEST }
	return Join-Path (Split-Path -Parent $ClippingsDest) 'device-asins.raw.json'
}

function Get-AsinFromName([string]$Name) {
	$base = Split-Path -Leaf $Name
	if ($base -match '\.azw3f|\.azw3r|\.apnx') { return $null }
	$best = $null
	for ($i = 0; $i -lt $base.Length; $i++) {
		if ($base[$i] -ne '_') { continue }
		$rest = $base.Substring($i + 1)
		if ($rest.Length -lt 10) { continue }
		$asin = $rest.Substring(0, 10)
		if ($asin -notmatch '^[A-Z0-9]{10}$') { continue }
		$after = if ($rest.Length -eq 10) { '' } else { $rest.Substring(10, 1) }
		if ($after -ne '' -and $after -ne '.') { continue }
		$best = @{ Label = $base.Substring(0, $i); Asin = $asin }
	}
	return $best
}

function ConvertTo-AsinsJson($Entries) {
	$parts = New-Object System.Collections.Generic.List[string]
	foreach ($entry in $Entries) {
		$label = $entry.Label.Replace('\', '\\').Replace('"', '\"')
		$asin = $entry.Asin.Replace('\', '\\').Replace('"', '\"')
		[void]$parts.Add("  {`"label`":`"$label`", `"asin`":`"$asin`"}")
	}
	if ($parts.Count -eq 0) { return "[`n]`n" }
	return "[" + "`n" + ($parts -join ",`n") + "`n]`n"
}

function Find-MassStorageClippings {
	try {
		$disks = Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType=2' -ErrorAction SilentlyContinue
	} catch {
		return $null
	}
	foreach ($disk in @($disks)) {
		foreach ($rel in @('documents\My Clippings.txt', 'My Clippings.txt')) {
			$candidate = Join-Path $disk.DeviceID $rel
			if (Test-Path -LiteralPath $candidate) { return $candidate }
		}
	}
	return $null
}

function Get-ShellFolderItems($FolderItem) {
	try {
		$folder = $FolderItem.GetFolder
		if ($null -eq $folder) { return @() }
		return @($folder.Items())
	} catch {
		return @()
	}
}

function Test-KindleName([string]$Name) {
	return $Name -match '(?i)kindle|paperwhite|scribe|oasis'
}

function Find-NamedChild($FolderItem, [string]$Wanted, [int]$Depth) {
	if ($Depth -lt 0 -or $null -eq $FolderItem) { return $null }
	foreach ($child in (Get-ShellFolderItems $FolderItem)) {
		if ($child.Name -eq $Wanted) { return $child }
		try {
			if ($child.IsFolder) {
				$found = Find-NamedChild $child $Wanted ($Depth - 1)
				if ($null -ne $found) { return $found }
			}
		} catch { }
	}
	return $null
}

function Add-AsinsFromFolder($FolderItem, [int]$Depth, $Into) {
	if ($Depth -lt 0 -or $null -eq $FolderItem) { return }
	foreach ($child in (Get-ShellFolderItems $FolderItem)) {
		$parsed = Get-AsinFromName $child.Name
		if ($null -ne $parsed) {
			$existing = $Into[$parsed.Asin]
			if ($null -eq $existing -or $parsed.Label.Length -gt $existing.Label.Length) {
				$Into[$parsed.Asin] = $parsed
			}
		}
		try {
			if ($child.IsFolder -and $child.Name -notmatch '\.sdr$') {
				Add-AsinsFromFolder $child ($Depth - 1) $Into
			}
		} catch { }
	}
}

function Find-KindlePortableDevice($Shell) {
	$computer = $Shell.NameSpace(17)
	if ($null -eq $computer) { return $null }
	$named = $null
	$fallback = New-Object System.Collections.Generic.List[object]
	foreach ($item in @($computer.Items())) {
		if (Test-KindleName $item.Name) {
			$named = $item
			break
		}
		$fallback.Add($item)
	}
	if ($null -ne $named) { return $named }
	foreach ($item in $fallback) {
		$clippings = Find-NamedChild $item 'My Clippings.txt' 4
		if ($null -ne $clippings) { return $item }
	}
	return $null
}

function Copy-MtpItemToFile($Shell, $Item, [string]$DestFile) {
	$destDir = Split-Path -Parent $DestFile
	$stageDir = Join-Path $destDir ('.kindle-sync-tmp-' + [guid]::NewGuid().ToString('n'))
	New-Item -ItemType Directory -Path $stageDir | Out-Null
	try {
		$destNs = $Shell.NameSpace($stageDir)
		if ($null -eq $destNs) { Die "could not open staging folder $stageDir" }
		# 4 = no progress UI, 16 = yes to all
		$destNs.CopyHere($Item, 20)
		$staged = Join-Path $stageDir $Item.Name
		$deadline = (Get-Date).AddSeconds(60)
		$lastSize = -1
		$stable = 0
		while ((Get-Date) -lt $deadline) {
			Start-Sleep -Milliseconds 250
			if (-not (Test-Path -LiteralPath $staged)) { continue }
			$size = (Get-Item -LiteralPath $staged).Length
			if ($size -gt 0 -and $size -eq $lastSize) {
				$stable++
				if ($stable -ge 3) { break }
			} else {
				$stable = 0
				$lastSize = $size
			}
		}
		if (-not (Test-Path -LiteralPath $staged)) {
			Die 'MTP copy did not produce a file — unplug/replug the Kindle, tap its connect prompt, and retry'
		}
		if ((Get-Item -LiteralPath $staged).Length -le 0) {
			Die 'fetched an empty file — replug and retry'
		}
		Move-Item -LiteralPath $staged -Destination $DestFile -Force
	} finally {
		Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue
	}
}

function Copy-LocalFile([string]$Source, [string]$DestFile) {
	if (-not (Test-Path -LiteralPath $Source)) { Die "source disappeared: $Source" }
	$size = (Get-Item -LiteralPath $Source).Length
	if ($size -le 0) { Die 'fetched an empty file — replug and retry' }
	$destDir = Split-Path -Parent $DestFile
	$tmp = Join-Path $destDir ('.clippings.' + $PID + '.tmp')
	Copy-Item -LiteralPath $Source -Destination $tmp -Force
	Move-Item -LiteralPath $tmp -Destination $DestFile -Force
}

function Invoke-Pull([string]$Dest, [string]$AsinsDest) {
	$mass = Find-MassStorageClippings
	if ($mass) {
		Write-Host "Fetching My Clippings.txt from the Kindle (mass storage)..."
		Copy-LocalFile $mass $Dest
		$asinMap = @{}
		$root = Split-Path -Parent (Split-Path -Parent $mass)
		if (-not (Test-Path -LiteralPath $root)) { $root = Split-Path -Parent $mass }
		Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | ForEach-Object {
			$parsed = Get-AsinFromName $_.Name
			if ($null -ne $parsed) { $asinMap[$parsed.Asin] = $parsed }
		}
		[System.IO.File]::WriteAllText($AsinsDest, (ConvertTo-AsinsJson $asinMap.Values))
		return
	}

	$shell = New-Object -ComObject Shell.Application
	$kindle = Find-KindlePortableDevice $shell
	if ($null -eq $kindle) {
		Die 'no Kindle found — is it plugged in, awake, and its connect prompt accepted?'
	}
	$clippings = Find-NamedChild $kindle 'My Clippings.txt' 4
	if ($null -eq $clippings) {
		Die "'My Clippings.txt' not found on device"
	}
	Write-Host "Fetching My Clippings.txt from the Kindle (MTP)..."
	Copy-MtpItemToFile $shell $clippings $Dest

	$asinMap = @{}
	Add-AsinsFromFolder $kindle 2 $asinMap
	[System.IO.File]::WriteAllText($AsinsDest, (ConvertTo-AsinsJson $asinMap.Values))
}

$dest = Get-ClippingsDest
$asinsDest = Get-AsinsDest $dest
$destDir = Split-Path -Parent $dest
if (-not (Test-Path -LiteralPath $destDir)) {
	New-Item -ItemType Directory -Path $destDir | Out-Null
}

$pulled = $false
try {
	Invoke-Pull $dest $asinsDest
	$pulled = $true
} catch {
	Start-Sleep -Seconds 3
	try {
		Invoke-Pull $dest $asinsDest
		$pulled = $true
	} catch {
		Die $_.Exception.Message
	}
}

if (-not $pulled -or -not (Test-Path -LiteralPath $dest)) {
	Die 'MTP fetch failed — unplug/replug the Kindle, tap its connect prompt, and retry'
}
$bytes = (Get-Item -LiteralPath $dest).Length
if ($bytes -le 0) { Die 'fetched an empty file — replug and retry' }
Write-Host "Copied $bytes bytes to $dest"
if (Test-Path -LiteralPath $asinsDest) {
	$asinBytes = (Get-Item -LiteralPath $asinsDest).Length
	Write-Host "Wrote device ASIN sidecar list to $asinsDest ($asinBytes bytes)"
}
