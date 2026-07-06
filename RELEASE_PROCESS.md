# Kraken Atlas Release Process

This is the current alpha release process. Release validation and VSIX packaging are automated through repo scripts; version choice, changelog wording, and final tester notes are still explicit human decisions.

## Goal

Produce exactly one validated VSIX per release version, with package metadata, CLI output, docs, and generated agent setup all reporting the same version.

## Preflight

1. Confirm the working tree and understand unrelated local changes:

```powershell
git status --short
```

2. Run the full test suite before changing release metadata:

```powershell
npm test
```

3. Decide the next version. Alpha tester fixes normally use the next patch version, for example `0.1.28` to `0.1.29`.

## Version Bump

1. Bump the release version without creating a git tag:

```powershell
npm run release:bump -- patch
```

The bump script updates package metadata, lockfile metadata, CLI/help version strings, extension fallback version, generated agent skill version, local install artifact paths, release-process examples, moves non-empty `Unreleased` changelog notes into the new version section, and generates a new README `What's New` block above the older README release history.

2. Review the human-facing release notes before packaging:

- `src/cli.ts`
  - `--version` output
  - help banner
- `src/extension.ts`
  - fallback extension version
- `src/agent/terminalInstructions.ts`
  - generated agent skill version marker
- `README.md`
  - confirm the generated What's New block is accurate
  - confirm older release notes remain under `Release History`
  - local install command
  - local install command
- `GETTING_STARTED.md`
  - local install command
  - tarball example if changed
- `CHANGELOG.md`
  - confirm the new version section is accurate and `Unreleased` is ready for future work

`package:vsix` derives its artifact path from `package.json`, so it should not be edited during a normal release.

3. Run the automated version consistency check:

```powershell
npm run release:check-version
```

4. If needed, check that only expected historical references to the previous version remain:

```powershell
rg -n "0\.1\.28|0\.1\.29" src package.json package-lock.json README.md GETTING_STARTED.md CHANGELOG.md
```

For the outgoing version, it should normally remain only in older changelog sections.

## Validate Before Packaging

Run the full test suite after the version bump if `release:vsix` is not being run immediately:

```powershell
npm test
```

`release:vsix` runs `release:check-version` and `npm test` before packaging, so this separate test run is optional when cutting the final artifact in the same pass.

## Build The Release VSIX

Build the analyzer and VSIX once through the release automation:

```powershell
npm run release:vsix
```

The command prints the final artifact path, size, and install command. Expected artifact for the current version:

```powershell
..\pack-artifacts\kraken-atlas-0.2.2.vsix
```

Confirm the artifact exists:

```powershell
Get-Item ..\pack-artifacts\kraken-atlas-0.2.2.vsix | Select-Object FullName, Length, LastWriteTime
```

## Local Smoke Install

Install the VSIX into VS Code using the command printed by `release:vsix`, for example:

```powershell
code --install-extension ..\pack-artifacts\kraken-atlas-0.2.2.vsix --force
code --list-extensions --show-versions | Select-String kraken-atlas
```

In a target workspace, run:

```text
Kraken Atlas: Check Map Health
Kraken Atlas: Suggest Where To Add Code
```

For a release that changes ranking, retest the exact alpha-feedback query that motivated the release.

## Final Release Notes

Before handing the build to testers, report:

- VSIX path
- version
- main fixes
- validation commands run
- test result count
- any known warnings, such as .NET workload update messages

## Release History Audit

`CHANGELOG.md` is the canonical release history. The README keeps the current release summary plus a short historical section for older public-alpha notes.

To audit what was actually packaged in local VSIX artifacts, run:

```powershell
npm run release:history-from-vsix -- --write docs\packaged-release-history-audit.md
```

This opens every `..\pack-artifacts\kraken-atlas-<version>.vsix`, extracts packaged `CHANGELOG.md` and README release headings, and reports missing packaged notes. Early `0.1.9` and `0.1.10` artifacts did not include packaged changelogs; `0.1.11` and later artifacts do.

## Release Automation

The release scripts intentionally keep the high-token, easy-to-miss checks in code:

- `npm run release:check-version` verifies package-lock metadata, CLI version output, help banner, extension fallback version, generated agent skill marker, README install references, and getting-started install references.
- `npm run package:vsix` derives `..\pack-artifacts\kraken-atlas-<version>.vsix` from `package.json`.
- `npm run release:history-from-vsix` extracts packaged release notes from local VSIX artifacts and can write `docs\packaged-release-history-audit.md`.
- `npm run release:vsix` runs the version check, tests, analyzer publish, VSIX packaging, and final artifact reporting.

Remaining cleanup target:

- Centralize runtime version strings so CLI output, extension fallback, and generated agent setup read from one source instead of repeating the current version.
