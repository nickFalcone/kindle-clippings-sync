# Kindle Clippings Sync

An [Obsidian](https://obsidian.md/) plugin that imports highlights, notes, and bookmarks from a physical Kindle device's `My Clippings.txt` into per-book Markdown notes. One-way, additive, and idempotent: Kindle is the source of truth for new content flowing in; Obsidian is the source of truth for everything once it lands there.

A free, local alternative to paid highlight-sync services for the "physical Kindle over USB" use case. The plugin makes **no network requests** and has **zero runtime dependencies** — everything happens between the file you point it at and your vault.

**Status:** field-verified end-to-end (2026-07-10) on a Kindle Paperwhite Signature Edition under macOS — full 13-book import, no-op re-sync, delta append of new highlights, and a full delete-and-reimport with draft collapse whose per-book output matched the final highlight state shown on the device. The same device on Windows (2026-08-16) pulled via `kindle-sync.cmd` and delta-appended new highlights without rewriting existing notes.

## What it does

- Reads `My Clippings.txt` from a USB-connected Kindle — or any local copy of it (path set in settings, with a native Browse dialog). On modern MTP-only Kindles the file is pulled to a local path first; see the macOS and Windows MTP sections below.
- Parses all highlights, notes, and bookmarks; groups them by book.
- Writes one Markdown note per book (default folder: `Reference/Books`) with YAML frontmatter:

  ```markdown
  ---
  title: "Fahrenheit 451"
  author:
    - "Ray Bradbury"
  source: kindle
  tags: [books]
  ---

  ## Highlights

  - It was a pleasure to burn. (Page 45, Location 810-812)

  ## Notes

  - remember this for the essay (Page 45, Location 812)
  ```

- Re-syncs are **append-only**: the plugin tracks what it has already written (hash set in its own `data.json`), and only appends genuinely new clippings under the right heading. It never rewrites, deletes, or reconciles existing note content — your manual edits, deletions, and commentary are always preserved.

Trigger a sync via the command palette ("Sync Kindle highlights"), the ribbon book icon, or the "Sync now" button in settings.

## Where this differs from other Kindle importers

Four differences, each a consequence of the design goals above rather than a feature gap:

- **It can read a Kindle that the OS won't mount as a drive.** The usual approaches either look for `My Clippings.txt` on a mounted volume or ask you to pick the file yourself. On firmware 5.16.2+ the device is MTP-only: it never mounts on macOS, and on Windows it appears under This PC rather than as a drive letter. The pre-sync command hook exists to fetch the file off the device first.
- **It reads the device's own file rather than a per-book export.** The other common input is the HTML notebook you export and email yourself from the Kindle app, one book at a time. `My Clippings.txt` carries every book on the device in a single file, including sideloaded titles and personal documents.
- **It writes nothing into your notes to keep track of state.** There are no sentinel comments and no marker-delimited region that the plugin owns and rewrites. What has already been synced is a hash set in the plugin's own `data.json`, so it never parses a note back to learn what it did, and never has to judge whether rewriting part of your file is safe.
- **It collapses on-device edit drafts.** Resizing a highlight or editing a note appends a new entry with an overlapping location range instead of updating the original, so a highlight you adjusted three times is in the file three times. Identity based on location or timestamp treats each of those as a separate highlight; this parser merges them down to the final on-device state (see "Duplicates & edit drafts" below).

## Daily use (after setup)

1. Plug the Kindle in with a USB cable. If the Kindle shows a "connect to computer" prompt, tap to accept it.
2. **Right away**, click the book icon in Obsidian's left sidebar (Kindles quietly disconnect themselves a minute or so after being plugged in — if you waited too long, unplug, replug, and click again).
3. A notification tells you what happened: "added N clippings across M books", or "nothing new". That's it — new highlights are appended to each book's note; everything you've edited or deleted in those notes is left alone.

## Setup

Desktop only — the plugin reads a file outside your vault. Obsidian must be the macOS or Windows desktop app (not mobile, and not a Linux/WSL copy of Obsidian even if you build the plugin from WSL).

The clippings path and pre-sync command are stored **per OS** (`darwin` / `win32` / `linux`), not per machine. A Mac and a Windows PC sharing one vault — iCloud, Obsidian Sync, or any other folder sync — keep separate helper paths, while sync state and note-format toggles stay shared. Two computers on the **same** OS share those path settings, so prefer `~/Kindle/...` or `%USERPROFILE%\Kindle\...` over a hardcoded username.

The helper writes `My Clippings.txt` to a local folder **outside the vault** (`~/Kindle` or `%USERPROFILE%\Kindle`). That copy is not synced; each computer pulls its own. The plugin's `data.json` *is* in the vault and does sync — that is how the other machine knows what was already imported. Don't copy `data.json` by hand and don't delete it unless you also delete the generated notes.

### Step 1 — install the plugin into Obsidian

Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/nickFalcone/kindle-clippings-sync/releases), and put them in a folder called `kindle-clippings-sync` inside your vault's `.obsidian/plugins/` folder. (The `.obsidian` folder is hidden; in Finder, press `Cmd+Shift+.` inside your vault folder to show it.)

Then restart Obsidian and enable **Kindle Clippings Sync** under Settings → Community plugins → Installed plugins.

<details>
<summary>Or build from source (requires Node ≥ 22)</summary>

```bash
git clone https://github.com/nickFalcone/kindle-clippings-sync.git
cd kindle-clippings-sync
npm install && npm run build
mkdir -p "/path/to/your/vault/.obsidian/plugins/kindle-clippings-sync"
cp main.js manifest.json styles.css "/path/to/your/vault/.obsidian/plugins/kindle-clippings-sync/"
```

</details>

### Step 2 (macOS, modern Kindle) — one-time USB helper setup

Kindles on recent firmware don't show up in Finder at all (see "MTP Kindles on macOS" below for why). This one-time setup installs a small helper that fetches the highlights file over USB. Open the **Terminal** app and paste these blocks one at a time:

```bash
# Install Homebrew, the standard Mac package manager (skip if you already have it)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

```bash
# Install the USB library, then download and build the helper
brew install libmtp
git clone https://github.com/nickFalcone/kindle-clippings-sync.git ~/kindle-clippings-sync
cc -o /opt/homebrew/bin/mtp-pull ~/kindle-clippings-sync/scripts/mtp-pull.c \
  -I/opt/homebrew/include -I/opt/homebrew/include/libusb-1.0 -L/opt/homebrew/lib -lmtp -lusb-1.0
ln -sf ~/kindle-clippings-sync/scripts/kindle-sync.sh /opt/homebrew/bin/kindle-sync
```

(If you already cloned the repo in Step 1, reuse that folder instead of cloning again.)

### Step 2 (Windows) — one-time USB helper setup

Windows can see an MTP Kindle under This PC, but the file is not on a drive letter, so the plugin cannot browse to it directly. A small helper copies `My Clippings.txt` to `%USERPROFILE%\Kindle\` before each sync. WSL is not required to *use* the plugin; it is only an optional way to copy the helper if you develop from WSL (see [LOCAL-DEV.md](LOCAL-DEV.md)).

From PowerShell, in the repo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
```

### Step 3 — point the plugin at your highlights

In Obsidian → Settings → Kindle Clippings Sync. Path and pre-sync command are per OS; fill in the row for the machine you are on. The first time you open settings on a new OS they will look empty even if the other machine is already configured — that is expected.

| Setting | macOS | Windows |
| --- | --- | --- |
| Path to `My Clippings.txt` | `~/Kindle/My Clippings.txt` | `%USERPROFILE%\Kindle\My Clippings.txt` |
| Pre-sync command | `/opt/homebrew/bin/kindle-sync` | `"%USERPROFILE%\Kindle\kindle-sync.cmd"` |
| Book notes folder | Wherever you want the book notes, e.g. `Reference/Books` (shared) | same |

Older Kindles that appear as a drive letter: browse to `documents/My Clippings.txt` on the device and leave pre-sync empty. Linux: copy `My Clippings.txt` to a local path yourself and leave pre-sync empty; no helper is shipped yet.

Now plug in your Kindle and click the book icon — see "Daily use" above.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Path to `My Clippings.txt` | — | Text field + Browse button. **Per OS** — a Mac path is not used on Windows and vice versa. |
| Book notes folder | `Reference/Books` | Created if missing. Shared across machines. |
| Include notes | on | Your own Kindle annotations. Shared. |
| Include bookmarks | off | Bookmarks have no text. Shared. |
| Include clipping-limit stubs | on | See "Clipping limit" below. Shared. |
| Book ASINs file | empty | Optional manual JSON overrides (`bookKey` → ASIN). When unset, the plugin reads `device-asins.raw.json` beside the clippings file (written by `kindle-sync`). Per OS. |
| Pre-sync command | empty | Optional shell command run before each sync (e.g. `kindle-sync` to pull the file off an MTP Kindle); sync aborts if it fails. Gated by a confirmation prompt — see below. **Per OS.** |

The note template (headings, bullet format) lives in one place in code: `TEMPLATE` in `src/bookNoteWriter.ts`.

### Security & privacy disclosures

- **No network requests.** The plugin and the optional macOS/Windows helper scripts never talk to any server; the plugin has no runtime dependencies and no telemetry.
- **Cover art URLs.** When an ASIN is known (from `device-asins.raw.json` beside the clippings file, or from the optional Book ASINs file), newly created notes include an absolute `m.media-amazon.com` image URL. The plugin writes the URL only — it does not fetch the image. Obsidian loads the image when you view the note. Existing notes are never updated; sideloaded books without a device ASIN are omitted silently.
- **Reads files outside your vault:** the `My Clippings.txt` path you configure, and optionally `device-asins.raw.json` in the same folder (or a manual Book ASINs file). This is why the plugin is desktop-only.
- **The Browse button uses Electron's native file dialog** (probed defensively; if unavailable, you type the path instead).
- **The plugin never installs, downloads, or updates anything.** The Homebrew/`mtp-pull` setup (macOS) and `install-windows.ps1` (Windows) in Step 2 are one-time manual installs you run yourself; the plugin only ever runs the pre-sync command you configure, and only when you trigger a sync.
- **The optional pre-sync command executes a shell command you wrote yourself**, gated as described below.

### Security: why a shell-command setting exists, and how it's gated

MTP-only Kindles can't be read from inside Obsidian — fetching `My Clippings.txt` requires a helper that runs outside the app (see the macOS and Windows MTP sections below). The pre-sync command is the hook for that helper. Since it is by nature an arbitrary shell command, it is scoped and gated:

- It only runs when **you** trigger a sync — never in the background — and the sync aborts if it fails.
- Before a command string runs for the first time, the plugin displays it and asks for confirmation. Approval applies to that **exact string**; if the setting changes in any way, you're asked again before the next sync.
- It runs with your user account's privileges, like Obsidian itself. The setting (and its approval record) live in the plugin's `data.json`, so anything that can write inside your vault's `.obsidian` folder could alter them — the same trust boundary as installing or modifying a plugin. Don't paste commands you don't understand.

## Sync semantics

- **Edit a generated note, then re-sync:** edits untouched. New-ness is decided by the plugin's own synced-hash record, never by re-reading the note.
- **Delete a highlight bullet, then re-sync:** stays deleted permanently.
- **Add a highlight on the Kindle, then re-sync:** only the delta is appended.
- **Delete a highlight on the Kindle:** no-op; the plugin never deletes previously written content.

Sync state lives in the plugin's `data.json` (`syncState.syncedHashes`, keyed by book, values are clipping hashes). Deleting that file makes the next sync treat everything as new — which would re-append all clippings to existing notes. Don't do that unless you also delete the generated notes.

## `My Clippings.txt` format assumptions

The parser (`src/parser.ts`, pure function, fully unit-tested) bakes in these observations about the file format:

- Entries are separated by `==========`. Entry = book line, metadata line, blank line, optional body.
- Three entry types: `Your Highlight`, `Your Note`, `Your Bookmark` (bookmarks have no body).
- **Book identity is the exact first line** (e.g. `Fahrenheit 451 (Ray Bradbury)`), sanitized for the filename. No fuzzy title matching — the exact string is the v1 grouping contract.
- The last parenthetical on the book line is the author string; it's normalized to a list by splitting on `;`, `&`, and `and`, flipping a single `Last, First` comma.
- Page (`on page 92`) is optional; many ebooks only have `at location 1406-1407`. Location may be a range or a single number and is stored as written.
- Two date formats are recognized: `26 March 2016 14:59:39` (international) and `December 30, 2015 7:31:41 PM` (US). Anything else fails soft — `addedAt` is null. The parser never throws on malformed entries; it skips them.
- Multi-line (paragraph) highlight bodies are preserved and rendered as an indented single bullet.
- A leading UTF-8 BOM and CRLF line endings are both handled (both vary across Kindle firmware).
- **Clipping limit:** for DRM-limited books Kindle writes `<You have reached the clipping limit for this item>` instead of the text. These are surfaced as a visible `**[Clipping limit reached — …]**` stub bullet (toggleable), never silently dropped.
- **Duplicates & edit drafts:** the file is append-only on-device — exact duplicates are deduped by hash of `(book key, location, type, text)`. Beyond that (confirmed on a real Paperwhite): *resizing a highlight's boundaries or editing a note appends a new entry per adjustment*, with overlapping location ranges — the file journals every intermediate draft, while the device shows only the final state. The parser collapses same-book/same-type entries with overlapping location ranges down to the latest draft (by timestamp), so each highlight/note imports once, in its final on-device form.

## MTP Kindles on macOS (firmware 5.16.2+)

Newer Kindle firmware replaced USB Mass Storage with MTP, which macOS cannot mount — the device never appears in Finder. Two helpers in `scripts/` bridge this:

- `mtp-pull.c` — small C tool (libusb + libmtp) that looks up and fetches one file by name in a **single MTP session**, with a USB device reset fallback. The stock libmtp CLIs need two sessions (list, then fetch), which Kindles intermittently refuse — and `mtp-getfile` exits 0 even on failure. Build: see the comment in the file.
- `kindle-sync.sh` — quits OpenMTP if running, pulls `My Clippings.txt` to a local path (atomic write, never clobbers the previous copy on failure), and writes `device-asins.raw.json` beside it (ASINs scraped from book/sidecar folder names in the same MTP session). Set it as the plugin's **Pre-sync command** (full path, e.g. `/opt/homebrew/bin/kindle-sync`); Obsidian runs the sync after the pull. Env override: `KINDLE_CLIPPINGS_DEST` for where the file lands (default `~/Kindle/My Clippings.txt`); `KINDLE_DEVICE_ASINS_DEST` for the sidecar list (default `device-asins.raw.json` in the same folder). Rebuild `mtp-pull` after updating `scripts/mtp-pull.c` — see the build comment in that file.

**Hardware quirk (observed on a Paperwhite Signature Edition):** the Kindle drops off the USB bus entirely a short while after being plugged in — after that, nothing can reach it until you replug. Run the sync soon after connecting the device. If you get "no MTP device found", replug and retry.

## MTP Kindles on Windows (firmware 5.16.2+)

Windows shows the Kindle under This PC as a portable device, not as a drive letter, so the plugin still cannot open `My Clippings.txt` in place. `scripts/kindle-sync.ps1` (installed as `%USERPROFILE%\Kindle\kindle-sync.cmd`) copies the file locally first: it tries a removable drive letter if the Kindle still mounts that way, then falls back to the Shell.Application MTP copy. It also writes `device-asins.raw.json` beside the clippings file. Env overrides are the same as the macOS helper (`KINDLE_CLIPPINGS_DEST`, `KINDLE_DEVICE_ASINS_DEST`).

One-time install: `scripts/install-windows.ps1`. Set the plugin's pre-sync command to `"%USERPROFILE%\Kindle\kindle-sync.cmd"`. (From WSL, `scripts/install-windows.sh` copies the same files into your Windows home directory; Obsidian still has to be the Windows app.)

The same USB drop-off quirk applies; plug in and sync promptly. Field-verified (2026-08-16) on the same Paperwhite Signature Edition: pull + delta append, existing notes left intact.

## Known limitations / untested edge cases

- **Editing a highlight/note on-device *after* it has already been synced:** the append-on-edit behavior predicted in the original spec was **confirmed on real hardware** (highlight-resize drafts observed in a real clippings file) and is handled by the parser's draft collapse — but only for drafts that exist *before* a sync. If you sync, then edit that highlight on the Kindle, the next sync appends the new version as a second bullet: the old bullet is never rewritten or removed, because output is strictly append-only and replacing prior lines risks clobbering adjacent manual edits. Delete the stale bullet by hand if it bothers you (it stays deleted). See the comment on `hashClipping` in `src/parser.ts`.
- No deep links back to the Kindle: `My Clippings.txt` contains no ASIN, which such links require. (Amazon's cloud notebook would expose ASIN — that's the deferred phase-2 wireless path, along with its credential-storage and scraping-fragility tradeoffs.)
- Wireless/cloud sync is explicitly out of scope for v1; the parser is deliberately decoupled from file acquisition so an `AmazonCloudSource` could feed it later without a rewrite.
- Path settings are per OS, not per hostname: a second Mac would reuse the first Mac's clippings path and pre-sync command. Home-relative paths (`~/Kindle`, `%USERPROFILE%\Kindle`) keep that working when usernames differ.

## Development

```bash
npm install
npm test        # Vitest — parser, writer, sync-state, and pipeline tests
npm run build   # type-check + esbuild bundle → main.js
npm run lint
```

`src/parser.ts`, `src/bookNoteWriter.ts`, and `src/syncState.ts` are pure (no Obsidian API) and covered by tests in `tests/`, including end-to-end pipeline tests for the idempotency and edit-preservation guarantees. `src/main.ts` and `src/settings.ts` are the thin Obsidian-facing layer.

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Clippings-format samples from other Kindle models and Linux test reports are especially useful. Maintainer vault paths, WSL deploy, and the live iCloud `kb` install live in [LOCAL-DEV.md](LOCAL-DEV.md), not here.

## License and credits

MIT — see [LICENSE](LICENSE).

- Dedupe hashing uses [cyrb53](https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js) by bryc.
- The optional `mtp-pull` helper links [libmtp](https://libmtp.sourceforge.net/) and [libusb](https://libusb.info/), both LGPL-2.1. You build it locally; it is never distributed with the plugin.
