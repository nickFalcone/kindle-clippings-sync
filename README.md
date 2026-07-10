# Kindle Clippings Sync

An Obsidian plugin that imports highlights, notes, and bookmarks from a physical Kindle device's `My Clippings.txt` into per-book Markdown notes. One-way, additive, and idempotent: Kindle is the source of truth for new content flowing in; Obsidian is the source of truth for everything once it lands there.

This is a personal replacement for the Readwise → Obsidian pipeline for the "physical Kindle over USB" use case. It is not in the community plugin directory.

**Status:** field-verified end-to-end (2026-07-10) on a Kindle Paperwhite Signature Edition — full 13-book import, no-op re-sync, delta append of new highlights, and a full delete-and-reimport with draft collapse whose per-book output matched Readwise's cloud-sourced notes for the same book.

## What it does

- Reads `My Clippings.txt` from a USB-connected Kindle — or any local copy of it (path set in settings, with a native Browse dialog). On modern MTP-only Kindles the file is pulled to a local path first; see "MTP Kindles on macOS" below.
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

## Installation (manual)

1. `npm install && npm run build` — produces `main.js`.
2. Copy `main.js`, `manifest.json`, and `styles.css` into your vault at `.obsidian/plugins/kindle-clippings-sync/`.
3. Reload Obsidian and enable **Kindle Clippings Sync** in Settings → Community plugins.
4. In the plugin settings, set the path to `My Clippings.txt`. Older Kindles mount as a drive (`/Volumes/Kindle/documents/My Clippings.txt` on macOS); Kindles on firmware 5.16.2+ don't mount at all — point the plugin at a local copy and use the pre-sync command to refresh it automatically (see "MTP Kindles on macOS" below).

Desktop only (`isDesktopOnly: true`) — it reads a file outside the vault and uses Electron's file dialog.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Path to `My Clippings.txt` | — | Text field + Browse button |
| Book notes folder | `Reference/Books` | Created if missing |
| Include notes | on | Your own Kindle annotations |
| Include bookmarks | off | Bookmarks have no text |
| Include clipping-limit stubs | on | See "Clipping limit" below |
| Pre-sync command | empty | Optional shell command run before each sync (e.g. `kindle-sync --pull-only` to pull the file off an MTP Kindle); sync aborts if it fails |

The note template (headings, bullet format, frontmatter tags) lives in one place in code: `TEMPLATE` in `src/bookNoteWriter.ts`.

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
- The last parenthetical on the book line is the author string; it's normalized to a list by splitting on `;`, `&`, and `and`, flipping a single `Last, First` comma. The raw string is preserved on every parsed clipping.
- Page (`on page 92`) is optional; many ebooks only have `at location 1406-1407`. Location may be a range or a single number and is stored as written.
- Two date formats are recognized: `26 March 2016 14:59:39` (international) and `December 30, 2015 7:31:41 PM` (US). Anything else fails soft — the raw string is kept and the parsed date is null. The parser never throws on malformed entries; it skips them.
- Multi-line (paragraph) highlight bodies are preserved and rendered as an indented single bullet.
- A leading UTF-8 BOM and CRLF line endings are both handled (both vary across Kindle firmware).
- **Clipping limit:** for DRM-limited books Kindle writes `<You have reached the clipping limit for this item>` instead of the text. These are surfaced as a visible `**[Clipping limit reached — …]**` stub bullet (toggleable), never silently dropped.
- **Duplicates & edit drafts:** the file is append-only on-device — exact duplicates are deduped by hash of `(book key, location, type, text)`. Beyond that (confirmed on a real Paperwhite): *resizing a highlight's boundaries or editing a note appends a new entry per adjustment*, with overlapping location ranges — the file journals every intermediate draft, while the device shows only the final state. The parser collapses same-book/same-type entries with overlapping location ranges down to the latest draft (by timestamp), so each highlight/note imports once, in its final on-device form.

## MTP Kindles on macOS (firmware 5.16.2+)

Newer Kindle firmware replaced USB Mass Storage with MTP, which macOS cannot mount — the device never appears in Finder. Two helpers in `scripts/` bridge this:

- `mtp-pull.c` — small C tool (libusb + libmtp) that looks up and fetches one file by name in a **single MTP session**, with a USB device reset fallback. The stock libmtp CLIs need two sessions (list, then fetch), which Kindles intermittently refuse — and `mtp-getfile` exits 0 even on failure. Build: see the comment in the file.
- `kindle-sync.sh` — quits OpenMTP if running, pulls `My Clippings.txt` to a local path (atomic write, never clobbers the previous copy on failure), then triggers the plugin's sync command via the Local REST API plugin if reachable. `--pull-only` skips the trigger (used as the plugin's pre-sync command).

For one-click sync from inside Obsidian, set the plugin's **Pre-sync command** setting to `kindle-sync --pull-only` (full path).

**Hardware quirk (observed on a Paperwhite Signature Edition):** the Kindle drops off the USB bus entirely a short while after being plugged in — after that, nothing can reach it until you replug. Run the sync soon after connecting the device. If you get "no MTP device found", replug and retry.

## Known limitations / untested edge cases

- **Editing a highlight/note on-device *after* it has already been synced:** the append-on-edit behavior predicted in the original spec was **confirmed on real hardware** (highlight-resize drafts observed in a real clippings file) and is handled by the parser's draft collapse — but only for drafts that exist *before* a sync. If you sync, then edit that highlight on the Kindle, the next sync appends the new version as a second bullet: the old bullet is never rewritten or removed, because output is strictly append-only and replacing prior lines risks clobbering adjacent manual edits. Delete the stale bullet by hand if it bothers you (it stays deleted). See the comment on `hashClipping` in `src/parser.ts`.
- No deep links back to the Kindle: `My Clippings.txt` contains no ASIN, which such links require. (Amazon's cloud notebook would expose ASIN — that's the deferred phase-2 wireless path, along with its credential-storage and scraping-fragility tradeoffs.)
- Wireless/cloud sync is explicitly out of scope for v1; the parser is deliberately decoupled from file acquisition so an `AmazonCloudSource` could feed it later without a rewrite.

## Development

```bash
npm install
npm test        # Vitest — parser, writer, sync-state, and pipeline tests
npm run build   # type-check + esbuild bundle → main.js
npm run lint
```

`src/parser.ts`, `src/bookNoteWriter.ts`, and `src/syncState.ts` are pure (no Obsidian API) and covered by tests in `tests/`, including end-to-end pipeline tests for the idempotency and edit-preservation guarantees. `src/main.ts` and `src/settings.ts` are the thin Obsidian-facing layer.

## License

MIT
