---
name: add-cli-flag
description: End-to-end checklist for adding a new CLI flag to find-duplicate — parser helper, entry-point wiring, conflict validation, help text, README, CHANGELOG, and tests. Use whenever adding or changing a command-line option.
---

A flag is only "done" when every layer below is updated. Work through them in order.

## 1. Parser — `src/core/find-duplicates-cli-args.js`

- For a flag with a value, add a `parse<Name>Flag(args)` function built on the existing `extractFlagValue(args, '--flag', 'example')` helper — it already handles both `--flag value` and `--flag=value` forms and errors loudly on a missing value. Return `{ <name>, args }` with the flag removed from `args`, matching the existing parsers (`parsePortFlag`, `parseExcludeFlag`, `parseMinLengthFlag`).
- Validate the value and `process.exit(1)` with a clear `❌ Error:` message on garbage — follow the existing threshold validation style (`Number()` not `parseInt`, so trailing garbage fails).
- Boolean flags need no parser function — they're handled by `args.includes('--flag')` in the entry point.

## 2. Entry-point wiring — `find-duplicates.js` (`runCli()`)

- Peel value-flags off **before** `parseDirectoryArgs()` is called (order matters — positional parsing assumes flags are already removed). Boolean flags must be filtered out of `filteredArgs` too.
- Decide UI applicability: if the flag also affects the web UI, thread it into `startServer(...)` / `scanOptions`; if it's terminal-only, add an explicit conflict error with `--ui` (see the existing `--json` / `--fail-on-duplicates` conflict checks).
- If the flag affects scanning, add it to `scanOptions` and handle it in the relevant `src/core/` module.

## 3. Help text — `HELP_TEXT` in `find-duplicates.js`

Add the flag to the Options block (aligned with the existing columns) and, if it's a headline feature, an Examples line.

## 4. Docs

- `README.md` — update the options/usage section to match the new help text.
- `CHANGELOG.md` — add the flag under the upcoming version's section.

## 5. Tests — `tests/cli.test.js`

Cover at least:
- `--flag value` and `--flag=value` both parse.
- Missing value → exit non-zero with the error message.
- Invalid value → exit non-zero (if the flag validates).
- Conflict with `--ui` (or whichever combos you rejected) → exit non-zero.
- The flag actually changes behavior (one end-to-end run against `demo-project/` or a temp fixture).

Follow the existing `node:test` patterns in that file — the suite is Node's built-in runner, not Jest.

## 6. Verify

Run the `/verify` skill (lint + full tests + demo smoke runs) before calling it done.
