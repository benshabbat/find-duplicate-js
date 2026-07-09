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

## Reporting bugs

Open an issue at https://github.com/benshabbat/find-duplicate-js/issues with:
- What you ran (command/API call) and what you expected
- What happened instead
- A minimal code sample that reproduces the issue, if possible
