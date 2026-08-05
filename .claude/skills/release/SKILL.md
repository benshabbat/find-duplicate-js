---
name: release
description: Cut a new release of find-duplicate-js — verify, update CHANGELOG, npm version bump, push the tag, and watch the tag-triggered npm publish workflow through to a verified npm version. Use when the user asks to release, publish, or bump the version.
---

Releases here are **tag-driven**: pushing a `vX.Y.Z` tag triggers `.github/workflows/release.yml`, which tests, lints, checks the tag matches package.json, and publishes to npm via OIDC trusted publishing. Never run `npm publish` locally.

For a complex or failing release, delegate to the `release-manager` agent instead — it also covers debugging. For the standard happy path, follow these steps:

## Steps

1. **Preflight** — must all hold before anything else:
   - On `main`, clean working tree, `git pull` up to date.
   - CI green on main: `gh run list --workflow=ci.yml --limit 3`.
2. **Verify** — run the `/verify` skill (lint + tests + demo-project smoke runs). All green or stop.
3. **Changelog** — read `CHANGELOG.md`'s existing format, list changes since the last tag (`git log $(git describe --tags --abbrev=0)..HEAD --oneline`), add a section for the new version dated today. Commit with message `docs: changelog for vX.Y.Z`.
4. **Bump + tag** — choose the bump from the changes (breaking → `major`, feature → `minor`, fix-only → `patch`):
   ```
   npm version patch|minor|major
   ```
   This bumps package.json and creates the matching `vX.Y.Z` tag in one step. Never create the tag by hand — a hand-made tag that mismatches package.json fails the workflow's version check.
5. **Publish** — ⚠️ this step publishes to npm and is effectively irreversible. Unless the user already explicitly asked for this release, confirm before running:
   ```
   git push --follow-tags
   ```
6. **Watch + verify** — `gh run watch` until the Release workflow is green, then:
   ```
   npm view find-duplicate-js version
   ```
   must print the new version. Report success or the exact failure.

## If the publish fails

- **Auth/permission error on the publish step**: npm trusted-publisher setup is missing — it must be configured once on npmjs.com (package `find-duplicate-js` → Settings → Publishing access → Trusted Publisher → GitHub Actions, repository `benshabbat/find-duplicate-js`, workflow `release.yml`). This cannot be fixed from the CLI; tell the user.
- **Anything else**: hand off to the `release-manager` agent with the failing run's URL.
- A version number that reached npm is burned even if the release was bad — fix forward with the next patch version, never reuse a number.
