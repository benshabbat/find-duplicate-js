# Security Policy

## Supported versions

Only the latest published version of `find-duplicate-js` receives security
fixes. Fixes ship as a new minor or patch release; older versions are not
backported, so please upgrade to the current release before reporting.

(Stated as a rule rather than a version table on purpose — a table would go
stale on every release.)

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately by email to **benshabbat27@gmail.com** with `[security]` in
the subject line. Include the version, the command or configuration that
triggers the issue, and a proof of concept if you have one.

This is a single-maintainer project, so please allow a few days for an initial
reply. Once a fix is released, you will be credited in the CHANGELOG unless you
ask not to be.

## What is in scope

`find-duplicate-js` is a local developer tool with no runtime dependencies, so
the meaningful attack surface is narrow. These are the areas worth reporting:

- **The `--ui` web server** (`src/ui/find-duplicates-ui.js`). It binds to
  localhost and is intended for local use only, but any path traversal in the
  `/open-file` endpoint — reading or opening a file outside the scanned
  directory — is in scope.
- **The HTML report** (`src/ui/find-duplicates-report.js`). Function names, file
  paths, and code snippets from the scanned project are embedded in the report.
  Any input that escapes `escapeHtml` / `escapeJsString` and executes as script
  is in scope.
- **The parser and scanner** (`src/core/`). Scanning an untrusted repository
  should never execute code from that repository, write outside the report
  destination, or read files excluded by `.gitignore` handling.
- **Supply chain**: anything that would let a published artifact diverge from
  the tagged source in this repository.

## What is out of scope

- Denial of service from pointing the scanner at a pathologically large or
  deeply nested directory. It is a local CLI; the user controls the input.
- Exposure of the `--ui` server caused by deliberately binding it to a public
  interface or proxying it to the internet. It is not designed to be
  internet-facing.
- Findings in `demo-project/`, which contains intentionally duplicated sample
  code used by the test suite.

## Verifying what you installed

The package has **zero runtime dependencies** — `npm install find-duplicate-js`
pulls no third-party code. You can confirm that any release matches this
repository:

```sh
npm pack find-duplicate-js@1.11.0
tar -xzf find-duplicate-js-1.11.0.tgz
git clone --branch v1.11.0 --depth 1 \
  https://github.com/benshabbat/find-duplicate-js.git source

# Compare every file the tarball actually ships against the tagged source.
(cd package && find . -type f) | while read -r f; do
  diff -q --strip-trailing-cr "package/$f" "source/$f" >/dev/null \
    || echo "DIFFERS: $f"
done
```

Silence means the published artifact is identical to the tag.
`--strip-trailing-cr` is required because releases published from a Windows
machine carry CRLF line endings while the repository is checked out with LF.
