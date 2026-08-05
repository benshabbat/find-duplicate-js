---
name: benchmark
description: Measure find-duplicate-js scan performance on generated corpora of increasing size, and optionally compare against a baseline commit. Use before/after touching src/core hot paths (parser, normalize, similarity, scanner), when investigating "it's slow on my project", or as a pre-release regression check.
---

The hot path is O(n²) over extracted functions with Levenshtein scoring per pair — so runtime is driven by **function count**, not file count. Benchmark accordingly.

## 1. Generate deterministic corpora

Write a small generator script in the scratchpad directory (never inside the repo) that emits JS files from templates — no randomness, vary bodies by index so results are reproducible across runs and machines. Include ~10% intentional near-duplicates so the comparison path does real work. Three sizes:

| corpus | functions (approx) | purpose |
|--------|--------------------|---------|
| S      | 200                | quick signal |
| M      | 1000               | the meaningful number |
| L      | 3000               | only when a change targets scaling |

## 2. Measure

Per corpus, run the real CLI 3 times and take the median (first run pays filesystem cache; report it separately if it's an outlier):

```powershell
Measure-Command { node find-duplicates.js <corpus-dir> 70 --json | Out-Null }
```

(bash: `time node find-duplicates.js <corpus-dir> 70 --json > /dev/null`)

Also record from the `--json` output: `filesScanned`, `totalFunctions`, and duplicate count — a "speedup" that changed these numbers is a behavior change, not an optimization.

## 3. Compare against a baseline (when evaluating a change)

Never benchmark two versions by switching the working tree back and forth. Use a worktree:

```
git worktree add <scratchpad>/baseline <baseline-commit>
```

Run the identical corpora against both entry points, same machine, same session. Remove the worktree afterwards (`git worktree remove`).

## 4. Report

Table: corpus × version → median wall time, plus functions/duplicates counts proving identical behavior. Flag any regression >10%. If the result motivates optimization work, hand off to the `performance` agent with the corpus generator and numbers — don't start optimizing inside this skill.
