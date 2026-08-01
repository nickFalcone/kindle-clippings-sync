# Obsidian community plugin submission rules

Every individually-checkable rule that governs listing a plugin in the [Obsidian Community Plugins](https://obsidian.md/plugins) directory, extracted from the official documentation, with a concrete way to verify each one against this repository.

Point an agent at this file to re-run the compliance audit before any release. It works in any agent that can read files, search the repository, run shell commands, and fetch URLs — Cursor, Claude Code, or otherwise.

---

## Agent prompt

Copy everything in this block as your instruction to the agent.

> You are performing a pre-submission compliance audit of this Obsidian plugin on behalf of the maintainer. Obsidian's review team rejects submissions over small, easy-to-miss violations. Treat this as an adversarial, exhaustive audit, not a friendly code review.
>
> **Do not rely on your training data for what Obsidian's rules say.** These documents change, and stale assumptions are the exact failure mode this audit exists to prevent.
>
> **Step 1 — refresh the rules.** Fetch all five source documents listed under "Source documents" below and read them in full. Compare them against the rule tables in this file. If a rule has changed, been added, or been removed, say so explicitly at the top of your report and audit against the *fetched* version. This file is a cache, not the authority.
>
> **Step 2 — audit.** Work through every rule in every table. Read every file in the repository top to bottom; do not sample. Run the static scan and the verification commands, but treat them as a starting point rather than a limit — a passing grep is not proof when the rule needs judgment. For each rule record **Pass**, **Fail**, **Unclear**, or **N/A**, and cite file and line numbers as evidence. "Unclear" is a valid and expected answer: flag it rather than guessing, and say what would resolve it (a runtime test, a licensing question, a maintainer decision).
>
> **Step 3 — respect prior decisions.** Read "Accepted deviations" before reporting anything. Those items were already found, reviewed, and deliberately accepted; do not re-raise them as new findings. If you believe one has become wrong because the reasoning no longer holds or the surrounding code changed, say so directly and explain what changed.
>
> **Step 4 — report.** Structure your output as:
>
> 1. **Verdict.** One paragraph: is this submission-ready, and if not, how many BLOCKING items stand in the way.
> 2. **Findings table:** `# | Tier | Rule | Source | File:Line | Status | Evidence | Fix`.
> 3. **Prioritized fixes.** BLOCKING first, then SHOULD-FIX, then STRUCTURAL. Every fix must be a concrete proposed change — an actual diff, command, or wording — never "review this".
> 4. **Uncertain items,** listed separately so they don't get lost.
>
> Report only what you verified. Don't pad the findings with rules that plainly don't apply; group those as N/A with one line of justification.

---

## Tiers

| Tier | Source | Consequence of failing |
| --- | --- | --- |
| **BLOCKING** | Developer policies, Submission requirements, Submit your plugin | Submission rejected, or an approved plugin pulled later |
| **SHOULD-FIX** | Plugin guidelines | Recommendations, but reviewers routinely request changes for them |
| **STRUCTURAL** | Reference/Manifest field correctness | Automated review fails, or the directory delists the plugin |

Obligation wording in the tables: **must** is mandatory, **should** is recommended, **avoid** is discouraged, **conditional** applies only if the plugin does the thing described.

## Source documents

Re-fetch all five every time. The first four are the rule sources; the fifth governs the release mechanics the others assume.

1. [Developer policies](https://docs.obsidian.md/Developer+policies) — `DP-*`
2. [Submission requirements for plugins](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins) — `SR-*`
3. [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) — `PG-*`
4. [Reference/Manifest](https://docs.obsidian.md/Reference/Manifest) — `MF-*`
5. [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin) — `SP-*`

For API-version questions: the [Obsidian API changelog](https://github.com/obsidianmd/obsidian-api/blob/master/CHANGELOG.md), and each method's own reference page, which prints the version it was introduced in at the bottom — for example [`Vault.process`](https://docs.obsidian.md/Reference/TypeScript+API/Vault/process) says 1.1.0 and [`Vault.createFolder`](https://docs.obsidian.md/Reference/TypeScript+API/Vault/createFolder) says 1.4.0.

---

## 1. Developer policies — BLOCKING

Source: [Developer policies](https://docs.obsidian.md/Developer+policies).

| ID | Rule | Type | Check |
| --- | --- | --- | --- |
| DP-1 | Must not obfuscate code to hide its purpose | must | Production minification is fine; the source must be public and readable. Inspect `esbuild.config.mjs`. |
| DP-2 | Must not insert dynamic ads loaded over the internet | must | Follows from DP-9: no network code at all. |
| DP-3 | Must not insert static ads outside the plugin's own interface | must | Review every `Notice`, modal, and DOM insertion. |
| DP-4 | Must not include client-side telemetry | must | Static scan `DP-4`. |
| DP-5 | Must not install or update itself or its dependencies | must | No package-manager or self-update calls. Any user-authored command hook must be user-triggered only. |
| DP-6 | Themes must not load assets from the network | must | N/A for plugins. |
| DP-7 | Payment required for full access must be disclosed in the README | must, conditional | N/A unless features are gated behind payment. |
| DP-8 | An account required for full access must be disclosed in the README | must, conditional | N/A unless the plugin requires sign-in. |
| DP-9 | Network use must be disclosed in the README, naming which remote services and why | must, conditional | Static scan `DP-9`, then confirm README coverage. |
| DP-10 | Accessing files outside Obsidian vaults must be disclosed, with an explanation of why it's needed | must, conditional | Static scan `SR-11`, then confirm README coverage. |
| DP-11 | Static ads inside the plugin's own interface must be disclosed | must, conditional | N/A unless the plugin shows banners or promo messages. |
| DP-12 | Server-side telemetry must be disclosed, with a link to a privacy policy | must, conditional | N/A unless data is sent anywhere. |
| DP-13 | Closed-source code must be disclosed; handled case by case | must, conditional | N/A for an open-source repository. |
| DP-14 | Include a LICENSE file and clearly indicate the license | must | `ls LICENSE`, then cross-check `package.json` `license` and the README. |
| DP-15 | Comply with the original licenses of any code the plugin uses, including README attribution where required | must | Audit every vendored snippet, algorithm, and copied function for an author and source. Third-party code with no attribution is the trap here. |
| DP-16 | Respect Obsidian's trademark; don't use it in a way that suggests a first-party creation | must | Check `manifest.json` `name`, the README title, and the repository description. Descriptive use ("An Obsidian plugin that…") is fine. |
| DP-17 | Forks are not allowed without the original author's public written approval, or proof the author is unreachable and inactive for 6+ months | must | Verification commands, "not a fork". |
| DP-18 | Consider contributing to existing projects rather than creating new ones that duplicate existing functionality | should | Verification commands, "same niche". Be ready to differentiate. |
| DP-19 | A project that diverges from an existing one should start fresh and inherit no code without permission | should | Confirm no code was copied from the plugins DP-18 turns up. |

## 2. Submission requirements — BLOCKING

Source: [Submission requirements for plugins](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins).

| ID | Rule | Type | Check |
| --- | --- | --- | --- |
| SR-1 | Use `fundingUrl` only to link to financial-support services | must | Inspect the field if present. |
| SR-2 | Remove `fundingUrl` if you don't accept donations | must | Absent is correct when there's nothing to fund. |
| SR-3 | Set `minAppVersion` to the minimum Obsidian version the plugin is actually compatible with | must | Identify the newest API the code uses, look up the version it was introduced in, compare. Never copy this from a template. |
| SR-4 | Description should start with an action statement, such as "Import notes from…" or "Sync highlights from…" | should | Read `manifest.json` `description`. |
| SR-5 | Description must not start with "This is a plugin" | avoid | Read the description. |
| SR-6 | Description must follow the [Obsidian style guide](https://help.obsidian.md/Contributing+to+Obsidian/Style+guide) | must | Sentence case, plain language. |
| SR-7 | Description: 250 characters maximum | must | Manifest script. |
| SR-8 | Description must end with a period | must | Manifest script. |
| SR-9 | Description must avoid emoji and special characters | must | Confirm the string is plain ASCII. |
| SR-10 | Description must capitalize acronyms, proper nouns, and trademarks correctly — "Obsidian", "Markdown", "PDF" | must | Read the description. |
| SR-11 | If the plugin uses Node.js or Electron APIs, `isDesktopOnly` **must** be `true` | must | Static scan `SR-11`, then compare against the manifest. |
| SR-12 | Don't include the plugin ID in command IDs — Obsidian prefixes them automatically | must | `rg -n -A3 addCommand src/`, then compare each `id` against `manifest.json` `id`. |
| SR-13 | Remove all sample plugin code before submission | must | Static scan `SR-13`. Build scaffolding (`esbuild.config.mjs`, `version-bump.mjs`, `tsconfig.json`) is expected to stay. |

## 3. Submit your plugin — BLOCKING

Source: [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin).

Submission is **not** a pull request against `obsidianmd/obsidian-releases` any more. You sign in at [community.obsidian.md](https://community.obsidian.md) with an Obsidian account, link the GitHub account that owns the repository, then **Plugins → New plugin** and enter the repository URL. Review is automated, and feedback appears in the directory rather than in PR comments; you address it by publishing a new release with an incremented version. The directory reads `manifest.json` from HEAD of the default branch, while users download assets from the release whose tag matches that manifest version — which is why SP-7 and SP-8 are separate rules.

| ID | Rule | Type | Check |
| --- | --- | --- | --- |
| SP-1 | `README.md` in the repository root, describing the plugin's purpose and how to use it | must | `ls README.md` |
| SP-2 | `LICENSE` in the repository root | must | `ls LICENSE` |
| SP-3 | `manifest.json` in the repository root | must | `ls manifest.json` |
| SP-4 | Manifest `version` updated to a new semver `x.y.z` for the release | must | Manifest script. |
| SP-5 | The release tag must exactly match the manifest `version` | must | Release-freshness commands. This repo uses no `v` prefix — `.npmrc` sets `tag-version-prefix=""`. |
| SP-6 | The release must attach `main.js`, `manifest.json`, and optionally `styles.css` as binary attachments, and nothing else | must | Release-assets command. |
| SP-7 | The `manifest.json` at HEAD of the default branch must be accurate and committed | must | Release-freshness commands. |
| SP-8 | Users download assets from the release whose tag matches the manifest `version`, so that release must contain the code being submitted | must | Release-freshness commands: `git diff <tag>..HEAD -- src/` **must be empty.** Non-empty means reviewers read code that installers never receive. |
| SP-9 | `id` must be unique across all published plugins | must | Directory-collision command. |
| SP-10 | `id` must not contain `obsidian` | must | Manifest script. |

## 4. Plugin guidelines — SHOULD-FIX

Source: [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).

| ID | Rule | Type | Check |
| --- | --- | --- | --- |
| PG-1 | Avoid the global `app` object (`app`, `window.app`); use `this.app` | avoid | Static scan `PG-1`. |
| PG-2 | Avoid unnecessary console logging; by default the console should show only errors | avoid | Static scan `PG-2`. `console.error` is permitted. |
| PG-3 | If the plugin uses more than one `.ts` file, organize them into folders | should | `ls src/` |
| PG-4 | Rename placeholder class names from the sample plugin | should | Static scan `SR-13`. |
| PG-5 | Node and Electron APIs are unavailable on mobile | must | Static scan `SR-11`; pairs with `isDesktopOnly`. |
| PG-6 | Avoid lookbehind in regular expressions, for iOS compatibility | avoid | Static scan `PG-6`. Moot for a desktop-only plugin, but check anyway. |
| PG-7 | No top-level heading in the settings tab — not "General", not "Settings", not the plugin's name | avoid | Read the settings tab's `display()`. |
| PG-8 | Don't use the word "settings" in settings headings | avoid | Read every `setHeading()` call. |
| PG-9 | Use sentence case in all UI text: settings, commands, buttons, notices | should | `eslint-plugin-obsidianmd`'s `ui/sentence-case` rule covers this; also read the strings. |
| PG-10 | Use `new Setting(el).setName('…').setHeading()` instead of `h1`–`h6` elements | should | Static scan `PG-10`. |
| PG-11 | Avoid `innerHTML`, `outerHTML`, and `insertAdjacentHTML`; build DOM with `createEl` / `createDiv` / `createSpan` | avoid | Static scan `PG-11`. |
| PG-12 | Clean up every resource the plugin creates when it unloads | must | Check `onunload()` against everything long-lived the plugin starts: intervals, listeners, watchers, **child processes**, and in-flight async work that writes to the vault. `registerEvent`, `addCommand`, `addRibbonIcon`, and `addSettingTab` clean up automatically. |
| PG-13 | Don't detach leaves in `onunload` | avoid | `rg -n detachLeavesOfType src/` |
| PG-14 | Avoid setting a default hotkey for commands | avoid | `rg -n hotkeys src/` |
| PG-15 | Use the appropriate command callback: `callback`, `checkCallback`, `editorCallback`, `editorCheckCallback` | should | Read each `addCommand` call against its preconditions. |
| PG-16 | Avoid accessing `workspace.activeLeaf` directly; use `getActiveViewOfType()` or `workspace.activeEditor?.editor` | avoid | `rg -n activeLeaf src/` |
| PG-17 | Avoid managing references to custom views; use `getActiveLeavesOfType()` | avoid | `rg -n registerView src/` |
| PG-18 | Prefer the Editor API over `Vault.modify` for the file currently open | should | Static scan `PG-19`. |
| PG-19 | Prefer `Vault.process` over `Vault.modify` for files not currently open | should | Static scan `PG-19`. |
| PG-20 | Prefer `FileManager.processFrontMatter` over parsing and modifying YAML by hand | should | If frontmatter is hand-built, confirm it happens only at file creation and never rewrites existing frontmatter. |
| PG-21 | Prefer the Vault API (`app.vault`) over the Adapter API (`app.vault.adapter`) | should | Static scan `PG-19`. |
| PG-22 | Don't iterate all files to find one by path; use `getFileByPath` / `getFolderByPath` / `getAbstractFileByPath` | avoid | Static scan `PG-22`. |
| PG-23 | Use `normalizePath()` on user-defined paths | should | Applies to **vault** paths. Do not apply it to OS paths outside the vault — it rewrites Windows backslashes. |
| PG-24 | Call `updateOptions()` after reconfiguring a registered editor extension | should | `rg -n registerEditorExtension src/` |
| PG-25 | No hardcoded styling; use CSS classes plus Obsidian's CSS variables | must | Static scan `PG-25`; check `styles.css` for hardcoded colors instead of `var(--…)`. |
| PG-26 | Prefer `const` and `let` over `var` | should | `rg -n '\bvar ' src/` |
| PG-27 | Prefer `async`/`await` over Promise chains | should | Static scan `PG-27`. Wrapping a callback API in `new Promise` is not a violation. |

## 5. Reference/Manifest — STRUCTURAL

Source: [Reference/Manifest](https://docs.obsidian.md/Reference/Manifest). The manifest script covers MF-4 and MF-8 through MF-11 mechanically.

| ID | Rule | Type | Check |
| --- | --- | --- | --- |
| MF-1 | `author` present, string | must | Required field. |
| MF-2 | `minAppVersion` present, string | must | Required field; accuracy is SR-3. |
| MF-3 | `name` present, string | must | Required field. |
| MF-4 | `version` present, string, semver `x.y.z` | must | Manifest script. |
| MF-5 | `authorUrl`, if present, is a string | optional | — |
| MF-6 | `fundingUrl`, if present, is a string or an object of label to URL | optional | Pairs with SR-1 and SR-2. |
| MF-7 | `description` present, string | must | Content rules are SR-4 through SR-10. |
| MF-8 | `id` present, containing only lowercase letters and hyphens | must | Manifest script. |
| MF-9 | `id` must not end with `plugin` | must | Manifest script. |
| MF-10 | `id` must not contain `obsidian` | must | Manifest script; same as SP-10. |
| MF-11 | `isDesktopOnly` present, boolean | must | Manifest script; accuracy is SR-11. |
| MF-12 | `id` should match the plugin's folder name, or callbacks like `onExternalSettingsChange` won't fire | should | Compare against the install directory. |
| MF-13 | `name` is short and descriptive | should | Judgment. |
| MF-14 | `name` uses Basic Latin only; no punctuation except hyphen, plus, and parentheses; no emoji or special characters | must | Read the name. |
| MF-15 | `name` must not be the name of an Obsidian core plugin or feature, such as "Live Preview" or "Bases", on its own | must | Compound names containing a core term are generally accepted; check directory precedent. |
| MF-16 | `name` must not include "Obsidian" or variations like "Obsi-" or "-sidian" | must | Read the name. |
| MF-17 | `name` must be unique across the directory | must | Directory-collision command. |
| MF-18 | `name` must not use profanity or anything barred by the Code of Conduct | must | Read the name. |
| MF-19 | Plugin names must not contain the word "Plugin" | must | Read the name. |
| MF-20 | `versions.json` maps each released plugin version to the `minAppVersion` it shipped with, and lists only versions that were actually released | must | Cross-check against `manifest.json` and the published tags. |

---

## Post-publication: the directory scorecard

Publishing isn't the end of review. Every plugin page on [community.obsidian.md](https://community.obsidian.md/plugins) shows a scorecard, and **every new version is rescanned** — not just the first submission.

- **Health** (Excellent / Good / Poor): hygiene (readme, license, description, contributing guide), commit and release recency, issue close rate, and adoption (installs and stars). Adoption is part of the grade, so a new plugin can't top this axis immediately.
- **Review** (Satisfactory / Caution): an automated scan of the **latest release** — unsafe API usage, known-vulnerable dependencies, lint violations, whether the build verifies against source, and whether `main.js` and `styles.css` carry verified GitHub artifact attestation.

Two consequences specific to this repository:

1. **Lint warnings become publicly visible under Review.** The one accepted standing warning (see "Accepted deviations") may therefore show up on the plugin's public page. That doesn't change the decision — it's still the right trade against raising `minAppVersion` — but it's a visible cost, not a private one.
2. **Review grades the latest release, not `main`.** That makes SP-8 more than a submission-time rule: a release built from stale code is the artifact being scanned and scored. Attestation and zero runtime dependencies are the parts of the Review axis this repo can win outright, and CI already produces the attestation.

## High-friction checks

Reviewers look here first. Each maps to a rule above; they're collected because this is where real violations hide.

- `innerHTML` assignment from note or user content (PG-11)
- `eval()`, `new Function()`, or any dynamic code execution (DP-1)
- Direct Node `fs` use or absolute filesystem paths instead of the Vault API (PG-21, DP-10, SR-11)
- Network requests that aren't disclosed, or that happen without opt-in (DP-9)
- Hardcoded colors in `styles.css` instead of Obsidian CSS variables (PG-25)
- Global `app` instead of `this.app` (PG-1)
- Capabilities the plugin doesn't actually need (DP-5, SR-11)
- Leftover sample plugin strings, command IDs, or class names (SR-13, PG-4)
- Analytics or telemetry with no disclosure (DP-4, DP-12)
- `.gitignore` gaps: committed build artifacts, `node_modules`, or `data.json`, which holds user data
- `isDesktopOnly` not matching what the code actually does (SR-11)
- Third-party code without attribution (DP-15)
- **A published release that no longer matches `main` (SP-8)** — invisible from inside the source tree, and the one that caught this repository.

## Static scan

Every match needs a human read; a hit is a question, not a verdict. Patterns are fixed strings (`rg -F`) so nothing needs regex escaping.

```bash
scan() { printf '\n--- %s ---\n' "$1"; shift; rg -nF "$@" -- src/ || echo '(no matches)'; }

scan 'DP-4  telemetry'        -e telemetry -e analytics -e posthog -e sentry -e mixpanel
scan 'DP-9  network'          -e 'fetch(' -e requestUrl -e XMLHttpRequest -e axios -e 'http.request'
scan 'DP-1  dynamic exec'     -e 'eval(' -e 'new Function'
scan 'SR-11 node/electron'    -e "from 'fs" -e "from 'child_process" -e "from 'os'" -e "from 'path'" -e "require('electron'" -e window.electron
scan 'SR-13 sample code'      -i -e sample -e myplugin -e samplesettingtab -e examplemodal
scan 'PG-2  console logging'  -e console.log -e console.debug -e console.info -e console.warn
scan 'PG-10 raw headings'     -e "createEl('h" -e 'createEl("h'
scan 'PG-11 html sinks'       -e innerHTML -e outerHTML -e insertAdjacentHTML
scan 'PG-19 vault api'        -e vault.modify -e vault.adapter -e vault.process
scan 'PG-22 file lookup'      -e 'getFiles()' -e getMarkdownFiles
scan 'PG-25 inline styles'    -e '.style.' -e setCssStyles
scan 'PG-27 promise chains'   -e '.then('

# PG-1 (global app) and PG-6 (regex lookbehind) need look-around, so they are separate.
printf '\n--- PG-1  global app ---\n'
rg -n --pcre2 '\bwindow\.app|(?<!this\.)\bapp\.' -- src/ || echo '(no matches)'
printf '\n--- PG-6  regex lookbehind ---\n'
rg -n '\(\?<[=!]' -- src/ || echo '(no matches)'
```

## Verification commands

```bash
# Manifest field correctness — SP-4, SP-10, SR-7, SR-8, MF-4, MF-8 to MF-11
node -e "const m=require('./manifest.json');
console.log('semver        ', /^[0-9]+[.][0-9]+[.][0-9]+$/.test(m.version), m.version);
console.log('id charset    ', /^[a-z-]+$/.test(m.id), m.id);
console.log('id endsPlugin ', m.id.endsWith('plugin'), '| hasObsidian', m.id.includes('obsidian'));
console.log('desc length   ', m.description.length, '(max 250) | endsWithPeriod', m.description.endsWith('.'));
console.log('isDesktopOnly ', m.isDesktopOnly, '| fundingUrl', m.fundingUrl ?? '(absent)');"

# Release freshness — SP-5, SP-7, SP-8. The diff MUST be empty and status MUST be clean.
VERSION=$(jq -r .version manifest.json)
git tag -l "$VERSION"                          # must print the tag
git diff --stat "$VERSION"..HEAD -- src/       # must be empty
git status --short manifest.json versions.json # must be clean

# Release assets are exactly the Obsidian downloads and nothing else — SP-6
gh api repos/nickFalcone/kindle-clippings-sync/releases \
  --jq '.[] | {tag: .tag_name, draft: .draft, assets: [.assets[].name]}'

# Not a fork; license is declared — DP-17, DP-14
gh api repos/nickFalcone/kindle-clippings-sync --jq '{fork, visibility, license: .license.spdx_id}'

# Directory collisions: id and name are unique, plus plugins in the same niche — SP-9, MF-17, DP-18
curl -sL https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json -o /tmp/cp.json
node -e "const p=require('/tmp/cp.json'), m=require('./manifest.json');
console.log('id collisions  ', p.filter(x => x.id === m.id).length);
console.log('name collisions', p.filter(x => x.name.toLowerCase() === m.name.toLowerCase()).length);
console.log('same niche:', p.filter(x => /kindle|clipping/i.test(x.id + x.name + x.description)));"

# Build artifacts and user data are not committed
git ls-files | rg -n 'main\.js|data\.json|node_modules' || echo "clean"

# Everything green before you tag
npm test && npm run build && npm run lint
```

## Accepted deviations

Findings that were raised, reviewed, and deliberately accepted. **Do not report these as new findings.** Challenge one only if the reasoning has stopped holding.

| Rule | Decision | Reasoning |
| --- | --- | --- |
| PG-9 — `obsidianmd/settings-tab/prefer-setting-definitions` | Carry one lint warning | Adopting the declarative settings API would raise `minAppVersion` from 1.4.0 to 1.13.0. The rule is on the plugin's `no-restricted-disable` list, so `eslint-disable` is itself an error, and a stub `getSettingDefinitions()` returning `[]` only hides the warning while opting settings out of search anyway. `npm run lint` reports exactly this one warning and exits 0. See the comment above `KindleClippingsSettingTab` in `src/settings.ts`. Revisit if `minAppVersion` moves to 1.13+ for other reasons. |
| DP-18 — duplicate functionality | Ship anyway; not a fork | Reviewed against all four Kindle plugins in the directory by reading their source on 2026-07-31, not their READMEs. `kindle-html-importer` and `kindle-highlights-import` import an HTML/PDF notebook export and have zero occurrences of "my clippings" in their source, so they take a different input entirely. `obsidian-kindle-plugin` reads the file only through a native dialog re-picked every sync (`src/sync/syncClippings/openDialog.ts`), with no stored path. `kindle-local-sync` is the genuine overlap: same input, one note per book, desktop-only, local-only. Three structural differences against it, each verified in code: (1) its `src/sync/KindleDetector.ts` probes mount points (`/Volumes/Kindle/documents`, `D:`–`Z:`, `/media/$USER/Kindle`), and MTP-only Kindles (firmware 5.16.2+) never mount on macOS, so no path exists and its manual fallback has nothing to point at — none of the four imports `child_process`/`exec`/`spawn`, so none can run a fetch step at all; (2) it embeds `<!-- kindle-local-sync-id: … -->` comments in the note and rewrites the span between its markers, reading those comments back for sync state, while ours appends via `vault.process`, injects nothing, and keeps state in `data.json`; (3) its identity is a sha256 over title/author/type/location/dateAdded/content, so every on-device highlight resize is a new entry, whereas `collapseDrafts()` merges overlapping location ranges. The honest counter-argument is that the pre-sync hook could be contributed upstream instead; the answer is that its marker-and-rewrite model is the negation of append-only-with-external-state, so supporting both means two write engines in one plugin. DP-18 is a "consider" in the Forks section, no code is shared with any of them, and neither the automated review nor the scorecard checks for duplicate functionality. |
| SP-6 — `styles.css` is empty | Keep shipping it | An empty stylesheet breaks nothing and is explicitly optional. Removing it would leave a stale file in existing installs and require edits to the release workflow and two README lines, for no benefit. |
| PG-23 — `normalizePath` not applied to `clippingsPath` | Correct as written | That setting is an OS path outside the vault; `normalizePath` would rewrite Windows backslashes and corrupt it. Vault paths are normalized. |
| PG-20 — frontmatter built by hand | Correct as written | `bookNoteWriter.ts` builds frontmatter only for brand-new notes created through `vault.create`. Existing frontmatter is never read or modified, so the YAML-clobbering failure the rule guards against cannot occur. Appends go through `vault.process`. |
| SR-11, DP-10 — reads a file outside the vault, runs a shell command | Disclosed and gated | Unavoidable for the plugin's purpose: `My Clippings.txt` lives on the device. `isDesktopOnly` is `true`, the README discloses both, and the pre-sync command is user-authored, user-triggered, and gated behind a per-exact-string consent modal. Both are also the plugin's most review-sensitive capabilities, so keep the README disclosures current — the directory surfaces capability disclosures on the plugin's page. The gate is covered by `tests/preSync.test.ts`: consent required before the first run, approval persisted per exact string, any change re-prompting, cancel and modal-dismissal both refusing, failure aborting the sync with stderr surfaced, and `onunload` killing a running command. If a reviewer questions the shell-command setting, that file is the evidence. |

## Audit history

| Date | HEAD | Outcome |
| --- | --- | --- |
| 2026-07-31 | `0229ae5` | 89 rules extracted; 29 files reviewed. Two BLOCKING: the published `0.1.0` assets no longer matched `main` (SP-8), and the embedded cyrb53 hash had no attribution (DP-15). Four SHOULD-FIX: no `onunload` cleanup of the pre-sync child process (PG-12), an inert `getSettingDefinitions()` stub, stale contributor docs, and an undisclosed "installs nothing" assumption. All fixed except SP-8, which the next release resolves. Three deviations accepted. Zero STRUCTURAL failures. |
| 2026-07-31 | `0229ae5` | DP-18 reviewed properly by reading all four directory Kindle plugins' source; deviation entry rewritten with that evidence. Two corrections to this file found in the process, both from trusting cached knowledge over the live docs — exactly what the agent prompt warns about: submission has moved from a PR against `obsidianmd/obsidian-releases` to the community.obsidian.md portal, and the post-publication scorecard was missing entirely (it rescans every release and makes lint warnings public). `RELEASE.md` corrected to match. |
| 2026-08-01 | `0229ae5` | Test coverage added for the claims in the README's "Where this differs" section, which had been asserted in prose but not verified: `tests/main.test.ts` (11) drives the real `doSync()` against a mocked Obsidian API, and `tests/preSync.test.ts` (11) covers the shell-command consent gate and the `onunload` kill. 52 → 74 tests. Each new test was mutation-checked. Two mocking traps recorded in `CLAUDE.md` — `promisify(exec)` only exposes `.child` through `util.promisify.custom`, and modal promises settle only from a button handler — both of which produce tests that pass while proving nothing. Remaining untested: `mtp-pull.c` and `kindle-sync.sh` (C and shell, no harness) and real MTP hardware, so the device path stays field-verified. |
