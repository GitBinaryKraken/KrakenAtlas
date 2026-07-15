# Kraken Atlas Foundation Preview Testing

## Purpose

This preview validates the Walking Cartographer foundation in real VS Code
environments. It is intentionally narrower than the planned product.

The preview currently discovers solutions, .NET projects, project references,
and relevant workspace files; persists that structural map in SQLite; and offers
status, summary, exact-entity, restart, and diagnostic commands.

It does not yet provide Roslyn symbols, code usages, call graphs, ASP.NET/EF Core
semantics, TypeScript/React semantics, MCP tools, Context Packs, or AI-authored
node decorations. Please evaluate the capabilities that exist rather than the
planned semantic surface.

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
4. Copy a project stable key from the summary and run
   `Kraken Atlas: Lookup Entity`.
5. Run `Kraken Atlas: Restart Cartographer`, then show the summary again. The
   existing Atlas generation should reopen successfully.
6. Run `Kraken Atlas: Build Atlas` a second time. It should complete without DLL
   lock errors or stale Cartographer processes.
7. Close and reopen VS Code, then show the summary again to verify persistence.
8. Run `Kraken Atlas: Export Diagnostics`, review the JSON, and attach it to any
   issue where its local paths are acceptable to share.

Kraken Atlas performs static discovery and does not execute the application,
instantiate EF Core contexts, run migrations, or connect to project databases.

## What to Report

Please include:

- Operating system and architecture.
- VS Code, Kraken Atlas, and installed .NET runtime versions.
- Workspace shape: solution count, project count, approximate file count, and
  whether it is a multi-root workspace.
- Atlas counts and build duration.
- Expected projects that were missing or unexpected projects that appeared.
- The exact command that failed and the visible error.
- Whether restart, VS Code reload, and a second build succeeded.
- The exported diagnostic report after reviewing its paths.

Do not attach proprietary source files or database contents. The standard
diagnostic export does not contain source bodies.

## Known Limitations

- Project kinds and language coverage are based on structural discovery.
- Exact entity lookup requires a stable key or numeric ID; fuzzy symbol search is
  not implemented.
- The VSIX is framework-dependent and requires an installed .NET 10 runtime.
- Semantic analyzers and AI-facing query tools remain planned work.
- Workspace storage is local to the VS Code profile and workspace identity.

## Uninstall and Local Data

```powershell
code --uninstall-extension BinaryKraken.kraken-atlas
```

VS Code may retain extension workspace storage after uninstall. The diagnostic
report contains the exact `atlasPath`. Close VS Code before manually deleting
that SQLite file or its containing Kraken Atlas storage directory.

See [PRIVACY.md](PRIVACY.md) for the complete preview data-handling statement.
