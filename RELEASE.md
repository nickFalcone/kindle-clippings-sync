# Releasing

The community-plugin directory has two hard rules this process is built around:

- The **git tag must exactly equal `manifest.json`'s `version`** — semver `x.y.z`, **no `v` prefix**. The release workflow fails the build if they differ.
- `versions.json` maps each released plugin version to its `minAppVersion`. It should only contain versions that were actually released.

`main` requires PRs (repo ruleset), so version bumps go through a branch; the tag is created afterwards, on the merged commit.

## Before you release

Run the compliance audit in [SUBMISSION-RULES.md](SUBMISSION-RULES.md) — it holds all 89 directory rules, their sources, and a copy-paste prompt for pointing an agent at them. Do this **before** the version bump so any fixes ship in the release rather than needing another one.

Expect the audit to flag SP-8 (the published release no longer matches `main`) whenever `src/` has moved since the last tag; that's the condition this release resolves, and it should be clean again once step 5 is done. Anything else the audit reports should be fixed or consciously added to that file's "Accepted deviations" table before you bump.

## Steps

1. **Branch from up-to-date `main`** and bump the version:

   ```bash
   git checkout main && git pull
   git checkout -b release-x.y.z
   npm version patch --no-git-tag-version   # or minor / major / an explicit x.y.z
   ```

   `--no-git-tag-version` skips npm's own commit/tag (the tag must land on the merged main commit, not this branch). The bump still runs `version-bump.mjs`, which syncs `manifest.json` and adds the `version → minAppVersion` entry to `versions.json`.

   If the release raises `minAppVersion`, change it in `manifest.json` **before** running `npm version` so `versions.json` records the right mapping.

2. **Verify and ship the PR:**

   ```bash
   npm test && npm run build && npm run lint
   git commit -am "Release x.y.z"
   git push -u origin release-x.y.z
   gh pr create
   ```

   Merge once CI is green.

3. **Tag the merged commit on `main`:**

   ```bash
   git checkout main && git pull
   git tag x.y.z        # exact manifest version — NO "v" prefix
   git push origin x.y.z
   ```

4. **CI takes over** (`.github/workflows/release.yml`): it verifies the tag matches `manifest.json`, builds, attests `main.js` (and `styles.css` if present) with GitHub build provenance, and creates a **draft** release containing exactly `main.js`, `manifest.json`, and `styles.css` — the only assets Obsidian downloads.

5. **Publish the draft**: open the draft release on GitHub, write the release notes, and publish. The plugin version is live once the release is published — Obsidian installs/updates read the release assets directly.

## Rules of thumb

- **Never reuse or re-point a tag.** If a release is broken, bump to a new version and release again; attestation and directory caching both assume tags are immutable.
- Don't add extra assets to the release (no zips) — the directory scanner flags them and Obsidian ignores them.
- Releases built while the repo was private are unattested; the deleted 1.0.0 was one of those. Everything from 0.1.0 on is built by CI on the public repo.

## First release only — directory submission

Submission is **not** a pull request against `obsidianmd/obsidian-releases` — that flow is retired. It now goes through the Obsidian Community portal. After the release is published:

1. Re-run the [SUBMISSION-RULES.md](SUBMISSION-RULES.md) audit and confirm SP-8 is clean. The directory reads `manifest.json` from HEAD of the default branch, but users install the assets from the matching release, so both must be the same code.
2. Sign in at [community.obsidian.md](https://community.obsidian.md) with your Obsidian account and link the GitHub account that owns the repository — that's how the directory verifies ownership.
3. **Plugins → New plugin**, enter `https://github.com/nickFalcone/kindle-clippings-sync`, agree to the [Developer policies](https://docs.obsidian.md/Developer+policies), and submit.
4. Review is automated and its feedback appears in the directory, not in PR comments. Address it by fixing the code and publishing a **new release with an incremented version** (steps above); the plugin isn't installable from inside Obsidian until the automated review passes.
5. Confirm the README "Security & privacy disclosures" section is current before submitting — the outside-vault file read and the user-authored pre-sync command are this plugin's two review-sensitive capabilities, and the directory surfaces capability disclosures on the plugin page.

Every subsequent release is rescanned and re-scored, so the scorecard notes in [SUBMISSION-RULES.md](SUBMISSION-RULES.md) apply to all releases, not just the first.
