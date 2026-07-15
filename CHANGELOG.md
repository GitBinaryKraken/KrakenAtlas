# Changelog

## Unreleased

- Await Cartographer process exit during restart and extension deactivation,
  with bounded shutdown and forced-termination fallbacks to prevent stale .NET
  processes from locking development and package output assemblies.
- Add a .NET 10 runtime preflight, source-free diagnostic export, invited-alpha
  testing instructions, and explicit privacy, storage, telemetry, and license
  status documentation.

## 0.3.1 - 2026-07-15

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
- Documented the AI feature-implementation workflow, additional relationship
  dimensions, feature Blueprints, precedent detection, and change-surface
  queries.
- Made complete workspace orientation a canonical Atlas requirement, including
  multi-valued project roles, hosts, build dimensions, commands, and repository
  conventions with evidence and precedence.
- Defined bounded node-knowledge dimensions and a separate, evidence-backed AI
  assessment ledger so future agents can reuse feature analysis without
  overwriting canonical facts or carrying stale conclusions forward.
- Added a versioned Draft 2020-12 JSON Schema, example payload, and shared
  `decorate_nodes` command contract for evidence-backed agent node decorations.
- Expanded node decoration into typed self-enrichment intents for roles,
  feature/pattern participation, assessed relations, behavior, operational
  facets, change guidance, tests, docs, Landmarks, runtime resolutions, knowledge
  gaps, and review of previous assessments.

## 0.3.0

- Reserved for the first release produced from the new architecture. The current
  branch is not ready to publish until the release checklist is completed.
