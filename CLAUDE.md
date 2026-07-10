# CLAUDE.md

Obsidian plugin (TypeScript, desktop-only) that imports a Kindle's `My Clippings.txt` into per-book Markdown notes. See README.md for behavior and format details.

## Commands

```bash
npm test        # Vitest suite in tests/ — run after any src/ change
npm run build   # tsc type-check (src/ AND tests/) + esbuild bundle → main.js
npm run lint    # eslint; the 7 standing warnings (sentence-case "Kindle", settings API) are accepted
```

## Architecture — keep the purity boundary

- `src/parser.ts`, `src/bookNoteWriter.ts`, `src/syncState.ts` are **pure**: no `obsidian` or Node imports, string/data in → string/data out. This is a hard constraint — it's what makes them testable and the acquisition method swappable. New logic goes in the pure layer unless it genuinely needs the Obsidian API.
- `src/main.ts` and `src/settings.ts` are the thin Obsidian-facing layer (vault I/O, notices, settings UI, pre-sync command execution).
- All output formatting (headings, bullet renderers, frontmatter tags) lives in the `TEMPLATE` object at the top of `bookNoteWriter.ts` — change format there, nowhere else.

## Invariants (do not break)

1. **Append-only output.** The plugin never rewrites, deletes, or reconciles content already written to a note. "Already synced" is decided solely by the hash set in `SyncStateStore` (persisted in the plugin's `data.json`) — never by re-reading note content. Users' manual edits and deletions are sacred.
2. **Book identity is the exact first line** of a clippings entry (sanitized for filenames). No fuzzy matching.
3. **The parser never throws** on malformed input: bad entries are skipped, unparseable dates keep the raw string (`addedAtRaw`).
4. **Draft collapse** (`collapseDrafts` in parser.ts): the clippings file journals every on-device highlight-resize/note-edit as a new entry with overlapping location ranges; same-book/same-type overlapping ranges collapse to the latest draft. Verified against real hardware — don't "simplify" it to exact-location matching (draft ranges differ: 238-238 vs 238-240).
5. The BOM strip in parser.ts must stay written as the `﻿` escape — a literal BOM character in the source breaks grep/tooling.
6. `manifest.json` `minAppVersion` is 1.4.0 because `Vault.createFolder` requires it (enforced by eslint-plugin-obsidianmd).

## Deployment (this machine)

Owner's live install: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/kb/.obsidian/plugins/kindle-clippings-sync/`. Deploy = `npm run build`, then copy **only `main.js`** (and `manifest.json`/`styles.css` if changed). **Never overwrite that folder's `data.json`** — it holds live sync state; losing it causes duplicate re-appends. The user must reload Obsidian (Cmd+R) after a deploy.

## scripts/ — macOS MTP helpers

Modern Kindles (firmware 5.16.2+) use MTP; macOS can't mount them. `mtp-pull.c` (installed at `/opt/homebrew/bin/mtp-pull`) fetches `My Clippings.txt` in a **single MTP session** — Kindles intermittently refuse a second session, and the stock `mtp-getfile` exits 0 on failure, so don't replace it with libmtp's CLI tools. It includes a libusb reset fallback. `kindle-sync.sh` wraps it (`--pull-only` is what the plugin's pre-sync command runs; without the flag it also triggers the sync via the Local REST API plugin). Hardware quirk: the Kindle drops off the USB bus entirely a short while after plug-in; nothing can reach it until replugged — this is not a bug in the scripts.

## Testing conventions

Fixtures are inline strings built with the `entry()` helper in `tests/parser.test.ts`; real-device patterns (draft clusters, trailing-space authors) are reconstructed there — extend those rather than inventing formats. `tests/pipeline.test.ts` drives the same pipeline `main.ts` runs against an in-memory Map "vault"; the append-only/idempotency guarantees are asserted there and must keep passing.
