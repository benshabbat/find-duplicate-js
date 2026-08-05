---
name: self-scan
description: Dogfood find-duplicate-js on its own source code and triage what it finds — real duplication worth refactoring vs acceptable/noise. Use periodically as a health check, after adding features, or to sanity-check the tool's output quality on a real codebase.
---

Run the tool on itself. This both keeps the codebase honest (a duplicate-finder shouldn't ship duplicated functions) and exercises the tool on real, non-fixture code.

## 1. Scan

Scan `src/` and the entry point — **not** the repo root, which would pull in `demo-project/` (intentional duplicates) and skew everything:

```
node find-duplicates.js src 70 --json
node find-duplicates.js tests 70 --json
```

Run `src` at threshold 70 and again at 85 — groups that appear only at 70 are "similar shape" candidates; groups surviving 85+ are the ones that matter.

## 2. Triage every reported group

For each group, read the actual functions (file:line from the JSON) and classify:

- **Real duplication** — same logic maintained twice; a bug fixed in one copy would be missed in the other. This is actionable: propose the shared-helper extraction (where it should live in `src/core`/`src/ui`), or hand larger restructuring to the `file-splitter` agent.
- **Acceptable similarity** — parallel-but-independent logic (e.g. two flag parsers that intentionally mirror each other, test helpers) where merging would hurt readability. Say why it's acceptable.
- **Tool noise (false positive)** — the functions aren't meaningfully similar. This is a finding about the *tool*, not the code: record the pair as a candidate case for the `accuracy-evaluator` agent, and note whether `--min-length` would have filtered it.

Test files duplicate setup code by nature — hold `tests/` findings to the "real duplication" bar only when the duplicated block is substantial.

## 3. Report

- Summary line per scan: functions found, groups at 70, groups at 85.
- Table of groups: members (file:line), similarity, matchType, classification, recommended action.
- A "clean bill" is a valid result — if nothing actionable, say so plainly rather than inventing work.
- Do not refactor anything in this skill — report and recommend; refactors go through their own branch/PR (`/pr`).
