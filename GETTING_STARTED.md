# Getting Started

Kraken Atlas `0.6.0` is the Change Surface Alpha of the complete rewrite. It
discovers .NET solutions, C# and
package.json projects, project references, relevant files, project roles, build
dimensions, commands, and governing rules, then stores and queries that
structural map from a versioned SQLite Atlas. The first semantic slice also
indexes compiler-bound C# declarations, signatures, exact source locations,
internal calls, construction, member access, type use, inheritance,
implementations, and overrides. It also maps common DI registrations,
attribute-routed controller endpoints, outbound HTTP requests, Dapper database
operations, and PostgreSQL objects into bounded cross-domain Routes.
It can project a bounded change surface from any exact entity, including direct
and transitive dependencies, affected projects, related attributed tests, and
focused build/test commands.

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
7. Run `Kraken Atlas: Search C# Symbols` with a type or member name and inspect
   the exact qualified names, signatures, projects, and definition locations.
8. Copy a returned C# symbol stable key and run `Kraken Atlas: Find C# Usages`
   to inspect exact incoming code relations and evidence spans.
9. Run `Kraken Atlas: Search Entities` for an endpoint route, service
   registration, or database table and keep the returned stable keys.
10. Run `Kraken Atlas: Show Relations` for one result and choose an incoming,
    outgoing, or bidirectional view.
11. Run `Kraken Atlas: Trace Route` with source and target stable keys. Supply
    comma-separated waypoint stable keys when several valid feature branches
    reach the same target.
12. Run `Kraken Atlas: Show Change Surface` with a method, endpoint, contract,
    or database-object stable key. Inspect dependency direction, related tests,
    affected projects, and verification commands.
13. Run `Kraken Atlas: Restart Cartographer`, then show the summary again.
14. Run `Kraken Atlas: Export Diagnostics` and review the source-free JSON.
15. Run `Kraken Atlas: Open Architecture Plan` to inspect the implementation
   roadmap.

The Atlas database is stored under the VS Code workspace storage directory and
is not written into the source repository.

See [the invited-alpha test pass](ALPHA_TESTING.md) and
[privacy, storage, and telemetry behavior](PRIVACY.md). This build is
`UNLICENSED` and provided only for invited evaluation.
