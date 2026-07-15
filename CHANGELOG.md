# Changelog

## Unreleased

- Replaced the legacy Kraken Atlas implementation with a clean architecture
  baseline derived from the new planning set.
- Preserved the published `BinaryKraken.kraken-atlas` Marketplace identity.
- Added a thin VS Code workspace extension and a .NET 10 Cartographer process.
- Added content-length framed JSON-RPC initialization, status, and shutdown.
- Added .NET solution, C# project, project-reference, and relevant-file
  discovery with deterministic identities and content hashes.
- Added a versioned SQLite schema, WAL mode, migration runner, atomic generation
  commits, stable entity IDs, relations, evidence, and analyzer-run records.
- Added Atlas build, summary, and exact entity queries through VS Code,
  JSON-RPC, and CLI.
- Added a fixture that proves durable reopen, stable identity across generations,
  and retention of the prior generation after failed discovery.
- Added integration tests across the extension/Cartographer protocol boundary.
- Added the product, architecture, Atlas, agent-query, roadmap, decision, and
  benchmark planning documents.

## 0.3.0

- Reserved for the first release produced from the new architecture. The current
  branch is not ready to publish until the release checklist is completed.
