# Release Process

Kraken Atlas keeps the existing Marketplace identity:

- Extension ID: `BinaryKraken.kraken-atlas`
- Package name: `kraken-atlas`
- Publisher: `BinaryKraken`

## Prepare

1. Move completed notes from `Unreleased` into the target version in
   `CHANGELOG.md`.
2. Run `npm run release:bump -- <patch|minor|major|version>`.
3. Review `package.json`, `package-lock.json`, the Cartographer project version,
   README, and changelog.

## Validate

```powershell
npm run release:check-version
npm test
npm run check:vsix
```

The VSIX is written to `..\pack-artifacts\kraken-atlas-<version>.vsix`.

## Publish

Publishing is an explicit manual action and is not performed by the build or
release scripts. Install and smoke-test the VSIX before updating the Marketplace.
