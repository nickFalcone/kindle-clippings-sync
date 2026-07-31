# Local development and deployment

How to build, deploy to the owner's live Obsidian vault on this machine, and verify that Obsidian is running the artifact you just built (not a stale release label).

For public releases (version bumps, tags, CI), see [RELEASE.md](RELEASE.md).

## Live install paths


| What                           | Path                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Obsidian plugin folder         | `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/kb/.obsidian/plugins/kindle-clippings-sync/` |
| `kindle-sync` helper (symlink) | `/opt/homebrew/bin/kindle-sync` → `~/kindle-clippings-sync/scripts/kindle-sync.sh` (see README setup; point at your clone) |
| `mtp-pull` binary              | `/opt/homebrew/bin/mtp-pull` (built from `scripts/mtp-pull.c`)                                        |
| Default clippings destination  | `~/Kindle/My Clippings.txt`                                                                           |




## Version files — what each one is for


| File                      | Role                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `package.json` `version`  | npm dev version; source of truth for `npm version` bumps                                         |
| `manifest.json` `version` | What Obsidian **displays** in Settings → Community plugins                                       |
| `versions.json`           | Obsidian community directory map: `{ "pluginVersion": "minAppVersion" }`; only released versions |


`npm version <x.y.z> --no-git-tag-version` runs `version-bump.mjs`, which syncs `manifest.json` and appends to `versions.json`. Git tags must match `manifest.json` exactly (see RELEASE.md).

**During local dev, these can disagree with what's installed in the vault.** Obsidian reads the version from the vault's `manifest.json`, not from `main.js`. A vault left on an old manifest (e.g. deleted private release `1.0.0`) will show the wrong label even after deploying a fresh build.

## Deploy workflow

**Automated (preferred):**

```bash
npm run deploy          # test → build → copy to vault → verify SHA-256
npm run pre-pr          # same + lint — run before opening a PR
npm run verify:deploy   # hash-check only (no build/deploy)
```

After deploy, reload Obsidian: **Cmd+R**.

Manual equivalent:

```bash
npm test && npm run build
VAULT_PLUGIN="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/kb/.obsidian/plugins/kindle-clippings-sync"
cp main.js manifest.json "$VAULT_PLUGIN/"
# cp styles.css "$VAULT_PLUGIN/"    # only if styles.css changed
shasum -a 256 main.js "$VAULT_PLUGIN/main.js"   # hashes must match
```

Implemented by `scripts/deploy-local.sh`. Override the vault path with `VAULT_PLUGIN=... npm run deploy` on another machine.

**Never copy `data.json`.** It holds live sync state (`syncState.syncedHashes`). Overwriting it makes the next sync treat everything as new and re-append all clippings. The deploy script never touches it.

## Verify Obsidian is running your build

The version Obsidian displays is not proof. After `npm run deploy`, the script verifies SHA-256 automatically. To re-check without redeploying:

```bash
npm run verify:deploy
```

Manual equivalent:

```bash
shasum -a 256 main.js \
  "$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/kb/.obsidian/plugins/kindle-clippings-sync/main.js"
```

Matching SHA-256 hashes = Obsidian is running exactly what you just built. Mismatch = run `npm run deploy`, then Cmd+R.

Uncommitted working-tree changes are what get built; `main.js` reflects your local tree, not necessarily what's on GitHub `main`.

The `kindle-sync` shell helper is already live when symlinked to the repo — no separate deploy step for script-only changes under `scripts/`.

## End-to-end test (MTP Kindle)

1. Plug Kindle in; accept "connect to computer" if prompted.
2. Cmd+R in Obsidian if you just deployed.
3. Click the book ribbon icon (or run "Sync Kindle highlights").
4. Pre-sync runs `kindle-sync` → pulls to `~/Kindle/My Clippings.txt` → plugin imports.

Optional pull-only check in Terminal (no Obsidian needed):

```bash
/opt/homebrew/bin/kindle-sync
```

Expected: fetch + byte count; no network calls, no REST API messages.

## Pre-sync command setting

Recommended value in plugin settings:

```
/opt/homebrew/bin/kindle-sync
```

Legacy `--pull-only` suffix is harmless (ignored) if still present in `data.json`.