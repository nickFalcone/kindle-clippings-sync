# Releasing

The community-plugin directory has two hard rules this process is built around:

- The **git tag must exactly equal `manifest.json`'s `version`** — semver `x.y.z`, **no `v` prefix**. The release workflow fails the build if they differ.
- `versions.json` maps each released plugin version to its `minAppVersion`. It should only contain versions that were actually released.

`main` requires PRs (repo ruleset), so version bumps go through a branch; the tag is created afterwards, on the merged commit.

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

After 0.1.0 is published:

1. PR the plugin's entry into [`obsidianmd/obsidian-releases`](https://github.com/obsidianmd/obsidian-releases) (`community-plugins.json`), following [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin).
2. In the PR description, proactively disclose the two things reviewers will ask about: the plugin reads one file outside the vault (the configured `My Clippings.txt`), and the optional pre-sync command executes a user-authored shell command behind a per-exact-string consent modal. Both are covered in README "Security & privacy disclosures".
3. Address review-bot feedback by bumping the version and publishing a new release (steps above), then updating the PR.
