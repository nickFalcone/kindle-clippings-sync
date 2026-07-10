# Kindle Clippings Sync

An Obsidian plugin that imports highlights, notes, and bookmarks from a physical Kindle device's `My Clippings.txt` into per-book Markdown notes. One-way, additive, and idempotent: Kindle is the source of truth for new content flowing in; Obsidian is the source of truth for everything once it lands there.

This is a personal replacement for the Readwise → Obsidian pipeline for the "physical Kindle over USB" use case. It is not in the community plugin directory.

## What it does

- Reads `My Clippings.txt` from a USB-mounted Kindle (path set in settings, with a native Browse dialog).
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
4. In the plugin settings, set the path to `My Clippings.txt` (on macOS typically `/Volumes/Kindle/documents/My Clippings.txt` while the Kindle is connected via USB).

Desktop only (`isDesktopOnly: true`) — it reads a file outside the vault and uses Electron's file dialog.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Path to `My Clippings.txt` | — | Text field + Browse button |
| Book notes folder | `Reference/Books` | Created if missing |
| Include notes | on | Your own Kindle annotations |
| Include bookmarks | off | Bookmarks have no text |
| Include clipping-limit stubs | on | See "Clipping limit" below |

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
- **Duplicates:** the file is append-only on-device, so edits create duplicate entries. Deduped by hash of `(book key, location, type, text)`, keeping the most recent timestamp.

## MTP Kindles on macOS (firmware 5.16.2+)

Newer Kindle firmware replaced USB Mass Storage with MTP, which macOS cannot mount — the device never appears in Finder. Two helpers in `scripts/` bridge this:

- `mtp-pull.c` — small C tool (libusb + libmtp) that looks up and fetches one file by name in a **single MTP session**, with a USB device reset fallback. The stock libmtp CLIs need two sessions (list, then fetch), which Kindles intermittently refuse — and `mtp-getfile` exits 0 even on failure. Build: see the comment in the file.
- `kindle-sync.sh` — quits OpenMTP if running, pulls `My Clippings.txt` to a local path (atomic write, never clobbers the previous copy on failure), then triggers the plugin's sync command via the Local REST API plugin if reachable. `--pull-only` skips the trigger (used as the plugin's pre-sync command).

For one-click sync from inside Obsidian, set the plugin's **Pre-sync command** setting to `kindle-sync --pull-only` (full path).

**Hardware quirk (observed on a Paperwhite Signature Edition):** the Kindle drops off the USB bus entirely a short while after being plugged in — after that, nothing can reach it until you replug. Run the sync soon after connecting the device. If you get "no MTP device found", replug and retry.

## Known limitations / untested edge cases

- **⚠️ Editing a Note on the Kindle device (UNVERIFIED against real hardware):** the working assumption is that Amazon appends a *new* entry at the same location with a new timestamp rather than replacing the old one. Since text differs, the edited note hashes differently and will appear as a **second bullet** alongside the original. This is a reasoned prediction from how `My Clippings.txt` is known to behave, not confirmed behavior — needs a real-device test (edit a note on-device, re-sync, count bullets). If it proves annoying, the fix is keying dedupe on `(book, location, type)` with latest-timestamp-wins — deliberately not done in v1 because replacing a prior line risks clobbering adjacent manual edits. See the comment on `hashClipping` in `src/parser.ts`.
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
