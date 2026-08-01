# Contributing to Kindle Clippings Sync

Thanks for your interest in improving the plugin. All contributions are welcome: bug reports, clippings-format samples from devices I don't own, platform testing, docs fixes, and code.

> By contributing, you agree that you authored 100% of the content (or have the rights to it) and that it may be distributed under the project's [MIT license](LICENSE).

## I have a question

Please skim the [README](README.md) first; it covers setup, sync semantics, and the known Kindle hardware quirks. If your question is unanswered, open a [GitHub issue](https://github.com/nickFalcone/kindle-clippings-sync/issues).

## Reporting bugs

The most valuable bug reports include:

- **A sanitized snippet of** `My Clippings.txt` showing the entry that misbehaved (redact the highlighted text if it's private). The *structure* is what matters: the book line, the metadata line, separators.
- Your **Kindle model and firmware version**, and your OS.
- What the plugin did vs. what you expected.

**Windows and Linux reports are especially welcome.** The plugin should work there but has only been field-tested on macOS as of v0.1.0.

**Security issues:** please use [GitHub private vulnerability reporting](https://github.com/nickFalcone/kindle-clippings-sync/security/advisories/new) instead of a public issue.

## Suggesting enhancements

Open an issue describing the use case before writing code. The plugin is deliberately small, and some things are out of scope by design (e.g. wireless/Amazon-cloud sync is deferred; anything that rewrites previously synced note content is off the table, see the invariants below).

## First code contribution

```bash
git clone https://github.com/nickFalcone/kindle-clippings-sync.git
cd kindle-clippings-sync
npm install
npm test        # Vitest suite must pass
npm run build   # type-check + esbuild bundle → main.js
npm run lint    # eslint with eslint-plugin-obsidianmd
```

Requires Node ≥ 22 (CI tests 22.x and 24.x). To try your build in Obsidian, copy `main.js` + `manifest.json` into `<vault>/.obsidian/plugins/kindle-clippings-sync/` and reload Obsidian.

`main` only accepts pull requests (enforced by a repo ruleset), so work on a branch and open a PR. CI runs build, tests, and lint on every PR.

### Architecture rules

- **Keep the purity boundary.** `src/parser.ts`, `src/bookNoteWriter.ts`, and `src/syncState.ts` are pure (no `obsidian` or Node imports). New logic goes there unless it genuinely needs the Obsidian API; only `src/main.ts`/`src/settings.ts` touch Obsidian.
- **Append-only output is sacred.** The plugin never rewrites or deletes note content it already wrote; "already synced" is decided only by the persisted hash set, never by re-reading notes.
- **The parser never throws** on malformed input. Bad entries are skipped, unparseable dates keep their raw string.
- **Don't "simplify" draft collapse** in `parser.ts`. The overlapping-location-range logic matches real device behavior (verified on hardware).
- Output formatting lives only in the `TEMPLATE` object in `src/bookNoteWriter.ts`.

### Tests and style

- Add tests for any `src/` change. Parser fixtures are inline strings built with the `entry()` helper in `tests/parser.test.ts`. Extend the real-device patterns there rather than inventing formats. The append-only/idempotency guarantees asserted in `tests/pipeline.test.ts` must keep passing.
- `npm run lint` must report **no errors and no new warnings**. Exactly two standing warnings are accepted, both on the settings tab and both from the same cause — it renders through `display()`, which Obsidian deprecated in 1.13.0 in favour of the declarative settings API: `obsidianmd/settings-tab/prefer-setting-definitions` and `@typescript-eslint/no-deprecated`. Keeping `display()` is deliberate, because `minAppVersion` is 1.4.0 and the replacement requires 1.13.0; the comment above `KindleClippingsSettingTab` in `src/settings.ts` covers the migration paths. Neither rule can be suppressed, and stubbing the method out to hide the first isn't a fix.
- Formatting follows `.editorconfig` (tabs); match the style of the surrounding code.

## Releases

Releases are cut by the maintainer. See [RELEASE.md](RELEASE.md).
