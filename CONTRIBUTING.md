# Contributing

Thanks for your interest in improving `find-duplicate-js`!

## Getting started

```bash
git clone https://github.com/benshabbat/find-duplicate-js.git
cd find-duplicate-js
npm install
npm test
```

There are no runtime dependencies, so `npm install` only sets up dev tooling (lint, etc).

## Project layout

- `find-duplicates.js` — CLI entry point and public API re-exports
- `src/core/` — file scanning, function/JSX extraction, normalization, similarity scoring
- `src/ui/` — HTTP server and HTML report generation for `--ui`
- `tests/` — `node --test` suite

## Making a change

1. Create a branch off `main` (e.g. `fix/short-description` or `feat/short-description`)
2. Make your change, keeping it focused — unrelated cleanup belongs in a separate PR
3. Add or update tests in `tests/` for the behavior you changed
4. Run the checks locally before opening a PR:
   ```bash
   npm test
   npm run lint
   ```
5. Open a pull request against `main` describing the change and why it's needed

## Code style

- ES modules (`type: module`), Node.js built-ins only — no runtime dependencies
- Match the existing style in the file you're editing; `npm run lint` enforces the baseline rules

## Releasing (maintainers)

Releases are published to npm automatically by `.github/workflows/release.yml`
whenever a `v*` tag is pushed. The workflow re-runs tests and lint, verifies
the tag matches `package.json`, and publishes with provenance via npm
trusted publishing (one-time setup on npmjs.com — see the comment at the top
of the workflow file; no token secret is stored in the repo).

1. Make sure `CHANGELOG.md` has a section for the new version
2. On an up-to-date `main`:
   ```bash
   npm version minor        # or patch/major; bumps package.json and creates the vX.Y.Z tag
   git push --follow-tags   # pushing the tag triggers the release workflow
   ```
3. Watch the Release workflow on GitHub Actions; when it's green, verify with
   `npm view find-duplicate-js version`

## Reporting bugs

Open an issue at https://github.com/benshabbat/find-duplicate-js/issues with:
- What you ran (command/API call) and what you expected
- What happened instead
- A minimal code sample that reproduces the issue, if possible
