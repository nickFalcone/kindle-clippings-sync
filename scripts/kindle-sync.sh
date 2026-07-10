#!/bin/bash
# kindle-sync — pull My Clippings.txt from a USB-connected Kindle (MTP) and
# trigger the Kindle Clippings Sync plugin in Obsidian.
#
# Newer Kindle firmware (5.16.2+) uses MTP instead of USB Mass Storage, so
# the device never mounts in Finder on macOS. This script uses libmtp
# (`brew install libmtp`) to fetch the file, then — if the Obsidian Local
# REST API plugin is running — fires the plugin's sync command so the whole
# flow is one terminal command.
#
# Only one MTP client can hold the device at a time; OpenMTP is quit if
# it's running.

set -euo pipefail

DEST="${KINDLE_CLIPPINGS_DEST:-$HOME/Kindle/My Clippings.txt}"
VAULT_PLUGINS="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/kb/.obsidian/plugins"
SYNC_COMMAND_ID="kindle-clippings-sync:sync-kindle-highlights"

die() { echo "kindle-sync: $*" >&2; exit 1; }

command -v mtp-files >/dev/null || die "libmtp not installed (brew install libmtp)"

if pgrep -qi openmtp; then
	echo "Quitting OpenMTP (it holds the MTP connection)..."
	osascript -e 'quit app "OpenMTP"' || true
	sleep 2
fi

lookup_file_id() {
	mtp-files 2>/dev/null | awk '
		/^File ID:/ { id = $3 }
		/Filename: My Clippings.txt$/ { print id; exit }
	'
}

echo "Looking for My Clippings.txt on the Kindle..."
FILE_ID="$(lookup_file_id)"
if [ -z "$FILE_ID" ]; then
	# Kindles drop the MTP session when they sleep; one retry after a pause
	# covers the common wake-up case.
	sleep 3
	FILE_ID="$(lookup_file_id)"
fi
[ -n "$FILE_ID" ] || die "device or file not found — is the Kindle plugged in, awake, and did you tap its connect prompt?"

mkdir -p "$(dirname "$DEST")"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
# File IDs can shift between MTP sessions; if the fetch fails, re-look-up once.
if ! mtp-getfile "$FILE_ID" "$TMP" 2>/dev/null; then
	FILE_ID="$(lookup_file_id)"
	[ -n "$FILE_ID" ] || die "lost the device between lookup and fetch — replug and retry"
	mtp-getfile "$FILE_ID" "$TMP" 2>/dev/null || die "MTP fetch failed twice — replug and retry"
fi
[ -s "$TMP" ] || die "fetched an empty file — replug and retry"
mv "$TMP" "$DEST"
trap - EXIT
echo "Copied $(wc -c < "$DEST" | tr -d ' ') bytes to $DEST"

# Trigger the sync inside Obsidian via the Local REST API plugin, if present.
# The API key is read at runtime from that plugin's own config; it never
# leaves this machine.
REST_DATA="$VAULT_PLUGINS/obsidian-local-rest-api/data.json"
if [ -f "$REST_DATA" ]; then
	API_KEY="$(python3 -c "
import json, sys
try:
    print(json.load(open('$REST_DATA')).get('apiKey', ''))
except Exception:
    pass
" 2>/dev/null || true)"
	if [ -n "$API_KEY" ]; then
		for BASE in "https://127.0.0.1:27124" "http://127.0.0.1:27123"; do
			if curl -ks -o /dev/null -X POST \
				-H "Authorization: Bearer $API_KEY" \
				--fail --max-time 5 \
				"$BASE/commands/$SYNC_COMMAND_ID/"; then
				echo "Triggered '$SYNC_COMMAND_ID' in Obsidian via $BASE"
				exit 0
			fi
		done
	fi
fi
echo "Could not reach Obsidian's Local REST API — run 'Sync Kindle highlights' in Obsidian manually."
