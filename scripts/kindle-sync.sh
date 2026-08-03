#!/bin/bash
# kindle-sync — pull My Clippings.txt from a USB-connected Kindle (MTP).
#
# Newer Kindle firmware (5.16.2+) uses MTP instead of USB Mass Storage, so
# the device never mounts in Finder on macOS. This script uses libmtp
# (`brew install libmtp`) to fetch the file to a local path for the
# Kindle Clippings Sync Obsidian plugin to import.
#
# Intended as the plugin's pre-sync command — Obsidian runs the sync itself
# after this script finishes.
#
# Only one MTP client can hold the device at a time; OpenMTP is quit if
# it's running.

set -euo pipefail

# Obsidian spawns commands with a minimal GUI PATH; make sure Homebrew's
# tools (mtp-files, mtp-getfile) are reachable regardless of caller.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

DEST="${KINDLE_CLIPPINGS_DEST:-$HOME/Kindle/My Clippings.txt}"
ASINS_RAW="${KINDLE_DEVICE_ASINS_DEST:-$(dirname "$DEST")/device-asins.raw.json}"

die() { echo "kindle-sync: $*" >&2; exit 1; }

# mtp-pull does the name lookup and fetch in ONE MTP session — Kindles
# intermittently refuse the second session that the stock two-step
# (mtp-files + mtp-getfile) needs, and mtp-getfile exits 0 even on failure.
# Source: scripts/mtp-pull.c (cc -o mtp-pull mtp-pull.c -I/opt/homebrew/include -L/opt/homebrew/lib -lmtp)
command -v mtp-pull >/dev/null || die "mtp-pull not installed — build it from scripts/mtp-pull.c"

if pgrep -qi openmtp; then
	echo "Quitting OpenMTP (it holds the MTP connection)..."
	osascript -e 'quit app "OpenMTP"' || true
	sleep 2
fi

echo "Fetching My Clippings.txt from the Kindle..."
mkdir -p "$(dirname "$DEST")"
TMP="$(mktemp -d)/clippings.txt" # path must not exist yet
trap 'rm -rf "$(dirname "$TMP")"' EXIT
if ! mtp-pull "My Clippings.txt" "$TMP" "$ASINS_RAW"; then
	# Kindles drop the MTP session when they sleep; one retry after a pause
	# covers the common wake-up case.
	sleep 3
	mtp-pull "My Clippings.txt" "$TMP" "$ASINS_RAW" || die "MTP fetch failed — unplug/replug the Kindle, tap its connect prompt, and retry"
fi
[ -s "$TMP" ] || die "fetched an empty file — replug and retry"
mv "$TMP" "$DEST"
echo "Copied $(wc -c < "$DEST" | tr -d ' ') bytes to $DEST"
if [ -f "$ASINS_RAW" ]; then
	echo "Wrote device ASIN sidecar list to $ASINS_RAW ($(wc -c < "$ASINS_RAW" | tr -d ' ') bytes)"
fi
