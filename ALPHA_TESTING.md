# Kraken Atlas C# Semantic Alpha Testing

## Purpose

This alpha validates the durable Cartographer foundation and first C# semantic
relationship map in real VS Code environments. It is intentionally narrower than
the planned product.

The preview currently discovers solutions, .NET and package.json projects,
project references, relevant workspace files, project roles, build dimensions,
supported commands, structured conventions, and governing instruction files. It
persists that structural map in SQLite and offers status, summary, orientation,
exact-entity, restart, and diagnostic commands. It also uses Roslyn to index C#
declarations, overload signatures, visibility, partial locations, and
generated/manual definition evidence, with a bounded symbol-search command.
It also records exact internal calls, construction, member reads and writes, type
use, inheritance, implementations, and overrides, and exposes a bounded,
code-only usage query.

It does not yet provide framework-aware ASP.NET/EF Core or SQL semantics,
TypeScript/React semantics, complete execution Routes, MCP tools, Context Packs,
or AI-authored node decorations. Please evaluate the capabilities that exist
rather than the planned semantic surface.

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
9. Run `Kraken Atlas: Restart Cartographer`, then show the summary again. The
   existing Atlas generation should reopen successfully.
10. Run `Kraken Atlas: Build Atlas` a second time. It should complete without DLL
   lock errors or stale Cartographer processes.
11. Close and reopen VS Code, then show the summary again to verify persistence.
12. Run `Kraken Atlas: Export Diagnostics`, review the JSON, and attach it to any
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
- Usage queries are incoming, code-only relation queries; general graph traversal,
  impact analysis, and framework-aware Routes remain planned.
- ASP.NET routes, middleware, DI lifetimes, EF Core models, and embedded SQL are
  not yet interpreted as framework or database objects.
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
