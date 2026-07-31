#!/bin/bash
# deploy-local — build plugin artifacts and copy them to the live Obsidian vault.
# See LOCAL-DEV.md. Never touches the vault's data.json.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VAULT_PLUGIN="${VAULT_PLUGIN:-$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/kb/.obsidian/plugins/kindle-clippings-sync}"

RUN_TEST=1
RUN_LINT=0
VERIFY_ONLY=0

usage() {
	cat <<EOF
Usage: $(basename "$0") [options]

  (default)   npm test, npm run build, deploy, verify SHA-256
  --lint      also run npm run lint (use before opening a PR)
  --skip-test skip npm test (build + deploy only)
  --verify-only
              compare repo main.js SHA-256 to vault copy; no build/deploy

Env:
  VAULT_PLUGIN  override live plugin folder (default: owner's kb vault)
EOF
}

die() { echo "deploy-local: $*" >&2; exit 1; }

sha256_file() {
	if command -v shasum >/dev/null; then
		shasum -a 256 "$1" | awk '{print $1}'
	elif command -v sha256sum >/dev/null; then
		sha256sum "$1" | awk '{print $1}'
	else
		die "need shasum (macOS) or sha256sum (Linux) for hash verification"
	fi
}

while [ $# -gt 0 ]; do
	case "$1" in
		--lint) RUN_LINT=1; shift ;;
		--skip-test) RUN_TEST=0; shift ;;
		--verify-only) VERIFY_ONLY=1; shift ;;
		-h | --help) usage; exit 0 ;;
		*) die "unknown option: $1 (try --help)" ;;
	esac
done

verify_hashes() {
	local repo_hash vault_hash
	repo_hash="$(sha256_file "$REPO_ROOT/main.js")"
	vault_hash="$(sha256_file "$VAULT_PLUGIN/main.js")"
	if [ "$repo_hash" = "$vault_hash" ]; then
		echo "verify: main.js SHA-256 match ($repo_hash)"
		return 0
	fi
	echo "verify: main.js SHA-256 MISMATCH" >&2
	echo "  repo:  $repo_hash" >&2
	echo "  vault: $vault_hash" >&2
	return 1
}

if [ "$VERIFY_ONLY" = 1 ]; then
	[ -f "$REPO_ROOT/main.js" ] || die "repo main.js missing — run npm run build first"
	[ -f "$VAULT_PLUGIN/main.js" ] || die "vault main.js missing at $VAULT_PLUGIN"
	verify_hashes
	exit 0
fi

cd "$REPO_ROOT"

[ "$RUN_TEST" = 1 ] && npm test
[ "$RUN_LINT" = 1 ] && npm run lint
npm run build

[ -f main.js ] || die "build did not produce main.js"
[ -f manifest.json ] || die "manifest.json missing"

[[ "$VAULT_PLUGIN" == *kindle-clippings-sync* ]] \
	|| die "VAULT_PLUGIN does not look like the kindle-clippings-sync folder: $VAULT_PLUGIN"
[ -d "$VAULT_PLUGIN" ] || die "vault plugin dir not found: $VAULT_PLUGIN"
[ -f "$VAULT_PLUGIN/data.json" ] || die "vault data.json missing — wrong folder?"

cp main.js manifest.json "$VAULT_PLUGIN/"
[ -f styles.css ] && cp styles.css "$VAULT_PLUGIN/"

verify_hashes || die "deploy copy failed verification"

echo "Deployed to $VAULT_PLUGIN"
echo "Reload Obsidian: Cmd+R"

KINDLE_SYNC="/opt/homebrew/bin/kindle-sync"
if [ -L "$KINDLE_SYNC" ]; then
	target="$(readlink "$KINDLE_SYNC")"
	if [ "$target" != "$REPO_ROOT/scripts/kindle-sync.sh" ]; then
		echo "note: $KINDLE_SYNC -> $target (not this repo's scripts/kindle-sync.sh)" >&2
	fi
elif [ -e "$KINDLE_SYNC" ]; then
	echo "note: $KINDLE_SYNC exists but is not a symlink to scripts/kindle-sync.sh" >&2
fi
