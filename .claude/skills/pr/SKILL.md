---
name: pr
description: Create a branch and pull request for find-duplicate-js following the repo's conventions — type/kebab branch naming, verified checks, honestly filled PR template, and CI watched to green. Use when the user asks to "open a PR", "push this as a PR", or finish a change for review.
---

This repo works branch → PR → merge to `main` (see PRs #8–#15). Follow its conventions exactly.

## Steps

1. **Branch** — if still on `main`, create one off up-to-date main. Naming convention from repo history: `<type>/<kebab-description>` where type is `feat`, `fix`, `perf`, `refactor`, `chore`, or `docs` (e.g. `fix/ui-dedup-xss-line-numbers`, `perf/reduce-allocations-and-redundant-walks`).
2. **Scope check** — one focused change per PR; unrelated cleanup gets its own branch (CONTRIBUTING.md rule).
3. **Verify before pushing** — run the `/verify` skill. CI runs the test matrix on **ubuntu + windows × Node 20/22/24** plus lint and `npm audit --audit-level=high`, so local green is necessary but watch for platform-specific code (paths, CRLF, shell assumptions).
4. **Commit** — conventional-commit style messages matching repo history (`feat:`, `fix:`, `perf:`, `chore(deps):` …).
5. **Push + create PR**:
   ```
   git push -u origin <branch>
   gh pr create --title "<type>: <description>" --body "<filled template>"
   ```
   The body must follow `.github/PULL_REQUEST_TEMPLATE.md`: a Summary (what + why) and the checklist — **check items only if actually true** (`npm test` passes, lint clean, tests added/updated, README updated if user-facing, CHANGELOG updated). If a checklist item is legitimately N/A, say so rather than silently checking it.
6. **Watch CI** — `gh pr checks --watch` (or `gh run watch`). Six matrix jobs + lint must all pass. If a Windows-only or Node-version-only job fails, that's a real platform bug — fix it, don't retry.
7. **Report** — the PR URL and CI status. Do not merge the PR yourself unless the user explicitly asked for merge.
