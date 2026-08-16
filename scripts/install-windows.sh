#!/usr/bin/env bash
# Copy the Windows Kindle helper into %USERPROFILE%\Kindle (from WSL or Git Bash).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WIN_USER="$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')"
[ -n "$WIN_USER" ] || { echo "install-windows: could not read Windows username" >&2; exit 1; }
DEST="/mnt/c/Users/${WIN_USER}/Kindle"

mkdir -p "$DEST"
cp "$ROOT/scripts/kindle-sync.ps1" "$ROOT/scripts/kindle-sync.cmd" "$DEST/"

cat <<EOF
Installed Windows helper to $DEST

In Obsidian (Windows) → Settings → Kindle Clippings Sync:

  Path to My Clippings.txt:
    %USERPROFILE%\\Kindle\\My Clippings.txt

  Pre-sync command:
    "%USERPROFILE%\\Kindle\\kindle-sync.cmd"

Those two settings are stored per computer; your Mac paths stay as they are.
Reload Obsidian (Ctrl+R) if you just deployed a new build, then sync once and
approve the pre-sync command when asked.
EOF
