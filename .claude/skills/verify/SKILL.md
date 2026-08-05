---
name: verify
description: Run the full verification suite for find-duplicate-js — ESLint, the node --test suite, and CLI smoke runs against demo-project (human output, --json, exit codes). Use before committing, before a release, or after any refactor.
---

Run every step below from the repo root. Do not stop at the first failure — run all steps, then report a pass/fail summary so one broken step doesn't hide another.

## 1. Lint

```
npm run lint
```

Must exit 0 with no errors.

## 2. Test suite

```
npm test
```

Runs Node's built-in test runner (`node --test`) over `tests/*.test.js` (5 files). All tests must pass.

## 3. CLI smoke runs against the demo fixture

`demo-project/` contains intentional duplicates, so a healthy scan **finds** duplicates:

```
node find-duplicates.js demo-project 70
```

Expect: a non-empty "Found N pairs ... in M groups" report, exit code 0.

```
node find-duplicates.js demo-project --json
```

Expect: valid JSON on stdout (parse it — check it has `directory`, `totalFunctions`, `duplicates`, `groups` keys), no decorative output mixed in.

```
node find-duplicates.js demo-project --fail-on-duplicates
```

Expect: exit code **1** (duplicates exist, so the CI-gate flag must fail the run). In PowerShell check `$LASTEXITCODE`; in bash `echo $?`.

```
node find-duplicates.js --version
```

Expect: exactly the version from package.json.

## 4. Report

Summarize as a short table: step, result, and for any failure the exact error output. If everything passed, say so in one line.
