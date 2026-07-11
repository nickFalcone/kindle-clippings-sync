# Contributing to Kindle Clippings Sync

Thanks for your interest in improving the plugin! All contributions are welcome — bug reports, clippings-format samples from devices I don't own, platform testing, docs fixes, and code.

> **Legal notice:** by contributing, you agree that you authored 100% of the content (or have the rights to it) and that it may be distributed under the project's [MIT license](LICENSE).

## I have a question

Open a [GitHub issue](https://github.com/nickFalcone/kindle-clippings-sync/issues) — there's no forum or chat. Please skim the [README](README.md) first; it covers setup, sync semantics, and the known Kindle hardware quirks.

## Reporting bugs

The most valuable bug reports include:

- **A sanitized snippet of `My Clippings.txt`** showing the entry that misbehaved (replace the highlight text if it's private — the *structure* is what matters: the book line, the metadata line, separators).
- Your **Kindle model and firmware version**, and your OS.
- What the plugin did vs. what you expected.

Format variations across Kindle models/firmware are the main source of parser bugs, and I can only test on the hardware I own — real-world samples are gold.

**Windows and Linux reports are especially welcome:** the plugin should work there but has only been field-tested on macOS. "It worked" is a useful report too.

**Security issues:** please use [GitHub private vulnerability reporting](https://github.com/nickFalcone/kindle-clippings-sync/security/advisories/new) instead of a public issue.

## Suggesting enhancements

Open an issue describing the use case before writing code — the plugin is deliberately small, and some things are out of scope by design (e.g. wireless/Amazon-cloud sync is deferred; anything that rewrites previously synced note content is off the table, see the invariants below).

## Your first code contribution

```bash
git clone https://github.com/nickFalcone/kindle-clippings-sync.git
cd kindle-clippings-sync
npm install
npm test        # Vitest suite — must pass
npm run build   # type-check + esbuild bundle → main.js
npm run lint    # eslint with eslint-plugin-obsidianmd
```

Requires Node ≥ 18. To try your build in Obsidian, copy `main.js` + `manifest.json` into `<vault>/.obsidian/plugins/kindle-clippings-sync/` and reload Obsidian.

`main` only accepts pull requests (enforced by a repo ruleset), so work on a branch and open a PR. CI runs build, tests, and lint on every PR.

### Architecture rules the review will hold you to

- **Keep the purity boundary.** `src/parser.ts`, `src/bookNoteWriter.ts`, and `src/syncState.ts` are pure — no `obsidian` or Node imports. New logic goes there unless it genuinely needs the Obsidian API; only `src/main.ts`/`src/settings.ts` touch Obsidian.
- **Append-only output is sacred.** The plugin never rewrites or deletes note content it already wrote; "already synced" is decided only by the persisted hash set, never by re-reading notes.
- **The parser never throws** on malformed input — bad entries are skipped, unparseable dates keep their raw string.
- **Don't "simplify" draft collapse** in `parser.ts` — the overlapping-location-range logic matches real device behavior (verified on hardware).
- Output formatting lives only in the `TEMPLATE` object in `src/bookNoteWriter.ts`.

### Tests and style

- Add tests for any `src/` change. Parser fixtures are inline strings built with the `entry()` helper in `tests/parser.test.ts` — extend the real-device patterns there rather than inventing formats. The append-only/idempotency guarantees asserted in `tests/pipeline.test.ts` must keep passing.
- `npm run lint` must introduce **no new warnings** (the 7 standing sentence-case/settings-API warnings are accepted).
- Formatting follows `.editorconfig` (tabs); match the style of the surrounding code.

## Releases

Releases are cut by the maintainer — see [RELEASE.md](RELEASE.md).
