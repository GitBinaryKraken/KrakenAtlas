# Kraken Atlas Change Surface Alpha Testing

## Purpose

This alpha validates the durable Cartographer foundation, complete static .NET
feature Routes, and the first evidence-backed change-surface projection in real
VS Code environments. It is intentionally narrower than the planned product.

The preview currently discovers solutions, .NET and package.json projects,
project references, relevant workspace files, project roles, build dimensions,
supported commands, structured conventions, and governing instruction files. It
persists that structural map in SQLite and offers status, summary, orientation,
exact-entity, restart, and diagnostic commands. It also uses Roslyn to index C#
declarations, overload signatures, visibility, partial locations, and
generated/manual definition evidence, with a bounded symbol-search command.
It also records exact internal calls, construction, member reads and writes, type
use, inheritance, implementations, and overrides, and exposes a bounded,
code-only usage query. The Persona Route slice also maps common DI registrations,
attribute-routed ASP.NET Core controller actions, statically recoverable outbound
HTTP requests, Dapper operations, and normalized PostgreSQL objects. General
entity search, directional relation queries, and bounded forward Routes expose
these facts through VS Code, JSON-RPC, and CLI.
It also returns bounded direct/transitive neighbors, dependency direction,
affected projects, attributed xUnit/NUnit/MSTest test cases, and focused build
or test commands for an exact seed entity.

It does not yet provide Minimal API or middleware semantics, EF Core model and
migration mapping, TypeScript/React semantics, impact analysis, MCP tools,
Context Packs, or AI-authored node decorations. Please evaluate the capabilities
that exist rather than the planned semantic surface.

## Distribution and License Status

The preview package is `UNLICENSED` and all rights are reserved by BinaryKraken.
It is provided only to invited alpha testers for evaluation. The package is not
an open-source license grant and should not be redistributed. A formal license
must be selected before broader public distribution.

## Requirements

- VS Code 1.90 or newer on a desktop workspace.
- The .NET 10 runtime (`Microsoft.NETCore.App 10.x`) available through `dotnet`
  on `PATH`.
- A trusted local workspace. Virtual and untrusted workspaces are not supported.

Kraken Atlas checks the runtime before starting Cartographer. When .NET 10 is
missing, the extension reports the detected runtimes and links to the installer.

## Install

```powershell
code --install-extension .\kraken-atlas-<version>.vsix --force
```

In VS Code, run `Developer: Reload Window`, then open the workspace being tested.

## Suggested Test Pass

1. Run `Kraken Atlas: Show Status`.
2. Run `Kraken Atlas: Build Atlas` and record the duration and reported project
   and file counts.
3. Run `Kraken Atlas: Show Atlas Summary` and compare its project list with the
   solutions and projects you expect.
4. Run `Kraken Atlas: Show Workspace Orientation`. Compare its project roles,
   target frameworks, runtime identifiers, build/test/run commands, package
   scripts, and governing rules with the repository.
5. Copy a project or orientation stable key and run
   `Kraken Atlas: Lookup Entity`.
6. Run `Kraken Atlas: Search C# Symbols` for an overloaded method, a partial
   type, and a duplicate short name. Verify qualified names, signatures,
   projects, generated/manual status, and definition locations.
7. Copy a method or type stable key from symbol search and run
   `Kraken Atlas: Find C# Usages`. Check calls, implementation/override links,
   dispatch classification, source symbol, project, and evidence location.
8. Repeat with an interface method and verify both callers and concrete member
   implementations are returned without README or documentation mentions.
9. Run `Kraken Atlas: Search Entities` for an HTTP route, a DI service name, and
   a PostgreSQL table. Verify entity kinds, signatures, stable keys, and evidence.
10. Run `Kraken Atlas: Show Relations` on an endpoint and verify the outbound
    `handled_by` and incoming `matches_endpoint` edges.
11. Trace a Route from a UI/controller method to a database object. Add the
    intended interface method as a waypoint if another valid branch reaches the
    same target. Verify every hop has a file and source span.
12. Check that the Route includes appropriate `calls`, `dispatches_to`,
    `sends_http`, `matches_endpoint`, `handled_by`, `executes_sql`, and database
    operation relations, without `contains` or documentation edges.
13. Run `Kraken Atlas: Show Change Surface` for a service method. Verify direct
    dependencies and dependents, bounded transitive results, affected projects,
    related attributed tests, evidence, and focused verification commands.
14. Repeat with a high-fanout DTO or database object. The response must respect
    depth/entity bounds and report truncation rather than flooding the output.
15. Run `Kraken Atlas: Restart Cartographer`, then show the summary again. The
   existing Atlas generation should reopen successfully.
16. Run `Kraken Atlas: Build Atlas` a second time. It should complete without DLL
   lock errors or stale Cartographer processes.
17. Close and reopen VS Code, then show the summary again to verify persistence.
18. Run `Kraken Atlas: Export Diagnostics`, review the JSON, and attach it to any
   issue where its local paths are acceptable to share.

Kraken Atlas performs static discovery and does not execute the application,
instantiate EF Core contexts, run migrations, or connect to project databases.

## What to Report

Please include:

- Operating system and architecture.
- VS Code, Kraken Atlas, and installed .NET runtime versions.
- Workspace shape: solution count, project count, approximate file count, and
  whether it is a multi-root workspace.
- Missing or incorrect project roles, commands, build dimensions, and governing
  repository rules.
- Missing, duplicated, or incorrectly qualified C# declarations and signatures.
- Missing or incorrect C# relation targets, dispatch kinds, or evidence spans.
- Missing or incorrect effective controller routes, authorization labels, DI
  lifetimes, HTTP matches, SQL operation kinds, or database object names.
- Routes that choose the wrong branch, omit a handoff, include structural edges,
  exceed their bounds, or lack source evidence.
- Change surfaces that omit proven direct neighbors, expand through unrelated
  shared types, misclassify dependency direction, miss attributed tests, or
  suggest irrelevant projects and commands.
- Atlas counts and build duration.
- Expected projects that were missing or unexpected projects that appeared.
- The exact command that failed and the visible error.
- Whether restart, VS Code reload, and a second build succeeded.
- The exported diagnostic report after reviewing its paths.

Do not attach proprietary source files or database contents. The standard
diagnostic export does not contain source bodies.

## Known Limitations

- Project kinds and language coverage are based on structural discovery.
- C# relations include only compiler-resolved targets declared inside the indexed
  workspace. External package symbols and unresolved/dynamic targets are omitted.
- Usage queries remain incoming and code-only. General relation queries and
  Routes are available, while impact analysis remains planned.
- Framework extraction currently covers attribute-routed controller actions,
  common generic/factory DI registrations, and statically recoverable HTTP
  requests. Minimal APIs, middleware ordering, filters, and dynamic runtime
  resolution are not mapped.
- Database extraction currently covers Dapper calls whose SQL can be recovered
  from literals, interpolated strings, or local initializers. EF Core models,
  migrations, ADO.NET, stored procedure definitions, SQL bodies, and dynamic SQL
  are not mapped.
- Route tracing is forward-only, shortest-path, bounded to 16 hops, and returns
  one route. Ordered stable-key waypoints disambiguate known feature branches.
- Change surfaces are static bidirectional graph projections, not predictions
  that every returned entity must be edited. Default traversal reports direct
  member reads/writes and type use but does not recursively expand through those
  high-fanout code relations. Explicit `--kind` filters override that profile.
- Test selection currently recognizes xUnit `Fact`/`Theory`, NUnit test
  attributes, and MSTest test-method attributes. Dynamic/custom test discovery
  and per-test runner filters remain planned.
- Symbol search matches name and qualified-name fragments and returns at most 100
  results.
- The VSIX is framework-dependent and requires an installed .NET 10 runtime.
- Additional semantic analyzers and AI-facing query tools remain planned work.
- Workspace storage is local to the VS Code profile and workspace identity.

## Uninstall and Local Data

```powershell
code --uninstall-extension BinaryKraken.kraken-atlas
```

VS Code may retain extension workspace storage after uninstall. The diagnostic
report contains the exact `atlasPath`. Close VS Code before manually deleting
that SQLite file or its containing Kraken Atlas storage directory.

See [PRIVACY.md](PRIVACY.md) for the complete preview data-handling statement.
