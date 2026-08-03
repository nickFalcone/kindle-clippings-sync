# CLAUDE.md

Obsidian plugin (TypeScript, desktop-only) that imports a Kindle's `My Clippings.txt` into per-book Markdown notes. See README.md for behavior and format details.

## Commands

```bash
npm test        # Vitest suite in tests/ — run after any src/ change
npm run build   # tsc type-check (src/ AND tests/) + esbuild bundle → main.js
npm run lint    # eslint
npm run deploy  # test → build → deploy to live vault → verify (see LOCAL-DEV.md)
npm run pre-pr  # deploy + lint — run before opening a PR
```

## Architecture — keep the purity boundary

- `src/parser.ts`, `src/bookNoteWriter.ts`, `src/syncState.ts` are **pure**: no `obsidian` or Node imports, string/data in → string/data out. This is a hard constraint — it's what makes them testable and the acquisition method swappable. New logic goes in the pure layer unless it genuinely needs the Obsidian API.
- `src/main.ts` and `src/settings.ts` are the thin Obsidian-facing layer (vault I/O, notices, settings UI, pre-sync command execution).
- All output formatting (headings, bullet renderers, frontmatter tags) lives in the `TEMPLATE` object at the top of `bookNoteWriter.ts` — change format there, nowhere else.

## Invariants (do not break)

1. **Append-only output.** The plugin never rewrites, deletes, or reconciles content already written to a note. "Already synced" is decided solely by the hash set in `SyncStateStore` (persisted in the plugin's `data.json`) — never by re-reading note content. Users' manual edits and deletions are sacred.
2. **Book identity is the exact first line** of a clippings entry (sanitized for filenames). No fuzzy matching.
3. **The parser never throws** on malformed input: bad entries are skipped, unparseable dates leave `addedAt` null.
4. **Draft collapse** (`collapseDrafts` in parser.ts): the clippings file journals every on-device highlight-resize/note-edit as a new entry with overlapping location ranges; same-book/same-type overlapping ranges collapse to the latest draft. Verified against real hardware — don't "simplify" it to exact-location matching (draft ranges differ: 238-238 vs 238-240).
5. The BOM strip in parser.ts must stay written as the `﻿` escape — a literal BOM character in the source breaks grep/tooling.
6. `manifest.json` `minAppVersion` is 1.4.0 because `Vault.createFolder` requires it (enforced by eslint-plugin-obsidianmd).

## Releasing

`main` requires PRs (repo ruleset) — branch, push, `gh pr create`; never commit to main directly. Releases: see RELEASE.md. The short version: bump with `npm version <x.y.z> --no-git-tag-version` on a branch (runs `version-bump.mjs`, which syncs `manifest.json`/`versions.json`), merge the PR, then tag the merged main commit with the **exact manifest version, no `v` prefix** — CI verifies the match, builds with attestation, and creates a draft release to publish manually. Never reuse a tag.

**Before every release, run the compliance audit in [SUBMISSION-RULES.md](SUBMISSION-RULES.md)** — all 89 community-directory rules with their sources, a static-scan script, and a copy-paste prompt to run the audit yourself. Two things there matter to you as an agent: the deviations in its "Accepted deviations" table are deliberate, so don't "fix" them; and any new deviation you introduce or accept belongs in that table with its reasoning. Note that a stale published release is invisible from inside the source tree — `git diff "$(jq -r .version manifest.json)"..HEAD -- src/` must be empty at submission time.

## Local dev and deployment

See [LOCAL-DEV.md](LOCAL-DEV.md) — live vault paths, deploy steps, version-file semantics, and how to verify Obsidian is running the build you just made (hash check; don't trust the Settings version label during dev). **Never overwrite the vault's `data.json`.**

## scripts/ — macOS MTP helpers

Modern Kindles (firmware 5.16.2+) use MTP; macOS can't mount them. `mtp-pull.c` (installed at `/opt/homebrew/bin/mtp-pull`) fetches `My Clippings.txt` in a **single MTP session** — Kindles intermittently refuse a second session, and the stock `mtp-getfile` exits 0 on failure, so don't replace it with libmtp's CLI tools. It includes a libusb reset fallback. An optional third argument writes `device-asins.raw.json` (ASINs from book/sidecar folder names in the same listing pass). `kindle-sync.sh` wraps it as the plugin's pre-sync command (pull only; Obsidian runs the sync). Hardware quirk: the Kindle drops off the USB bus entirely a short while after plug-in; nothing can reach it until replugged — this is not a bug in the scripts.

## Testing conventions

Fixtures are inline strings built with the `entry()` helper in `tests/parser.test.ts`; real-device patterns (draft clusters, trailing-space authors) are reconstructed there — extend those rather than inventing formats.

Two layers cover the sync itself, and they are not redundant:

- `tests/pipeline.test.ts` composes the pure functions against an in-memory Map "vault". Fast, no mocks, but it **reimplements** the loop, so it cannot catch drift in `main.ts`.
- `tests/main.test.ts` drives the real `doSync()`. `vitest.config.ts` aliases the `obsidian` module to `tests/mocks/obsidian.ts`, an in-memory stand-in (vault as a Map, folders as a Set, `notices[]` for assertions, `Plugin.saveData` round-tripped through JSON, `buttons`/`clickButton()`/`openModals` for modal interaction). This is the only place branches that exist solely in `main.ts` are reachable: folder-occupies-the-path, unusable filename, unload mid-sync, `create` vs `process` selection. Extend that mock rather than adding a second one.
- `tests/preSync.test.ts` covers the pre-sync command hook — the consent gate, approval persistence, failure handling, and the `onunload` kill. It owns a `child_process` mock because **`promisify(exec)` only exposes `.child` via a `util.promisify.custom` implementation**: a plain callback-style stub leaves `pending.child` undefined, `onunload()`'s `?.kill()` silently no-ops, and the kill test passes while proving nothing. Keep that symbol. Tests start the sync, click a button or unload, then await — the modal promise only settles from a handler.

The append-only guarantees must keep passing in all of them. Note that the suites assert generated notes contain **no** tracking markers or HTML comments — a deliberate product difference from other Kindle importers (see README "Where this differs"), not an incidental detail, so don't relax those assertions to make a feature fit.

These tests were each verified by mutation: removing the guard they cover makes them fail, and nothing else. If you change behavior here, re-check that the corresponding test actually fails first.
