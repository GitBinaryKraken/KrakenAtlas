# Getting Started

Kraken Atlas `0.3.1` established the first durable slice of the complete
rewrite. The current development line discovers .NET solutions, C# and
package.json projects, project references, relevant files, project roles, build
dimensions, commands, and governing rules, then stores and queries that
structural map from a versioned SQLite Atlas.

## Requirements

- VS Code 1.90 or newer.
- Node.js and npm for extension development.
- .NET 10 runtime for the current development VSIX.
- .NET 10 SDK for building the Cartographer.

Self-contained, platform-specific VSIX packaging is scheduled for product
hardening; the current development package launches the installed `dotnet`
runtime. Kraken Atlas checks for `Microsoft.NETCore.App` 10 before launching
Cartographer and provides an installation link when the runtime is unavailable.

## Build and Test

```powershell
npm install
npm test
```

## Package a VSIX

```powershell
npm run check:vsix
```

## Try the Extension

1. Open the repository in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Run `Kraken Atlas: Build Atlas`.
4. Run `Kraken Atlas: Show Atlas Summary` and inspect the discovered projects.
5. Run `Kraken Atlas: Show Workspace Orientation` and inspect project roles,
   build dimensions, commands, and governing rules.
6. Run `Kraken Atlas: Lookup Entity` with a project, facet, command, rule, or
   build-dimension stable key or numeric ID.
7. Run `Kraken Atlas: Restart Cartographer`, then show the summary again.
8. Run `Kraken Atlas: Export Diagnostics` and review the source-free JSON.
9. Run `Kraken Atlas: Open Architecture Plan` to inspect the implementation
   roadmap.

The Atlas database is stored under the VS Code workspace storage directory and
is not written into the source repository.

See [the invited-alpha test pass](ALPHA_TESTING.md) and
[privacy, storage, and telemetry behavior](PRIVACY.md). This build is
`UNLICENSED` and provided only for invited evaluation.
