# Kraken Atlas

Kraken Atlas is being rebuilt from scratch as a local semantic code map for AI
coding agents. The published extension identity remains
`BinaryKraken.kraken-atlas`; the implementation that existed through version
`0.2.3` has been removed from the current development line.

The new product focuses on:

1. Modern .NET and ASP.NET Core projects written in C#.
2. Database objects and data access defined in application code.
3. TypeScript and React projects and their connections to .NET APIs.
4. Small, evidence-backed agent queries and Context Packs.
5. Separate code-usage and documentation-relationship queries.

## Current Status

The current development line builds on the `0.3.1` Walking Cartographer. It
contains:

- A thin VS Code workspace extension and matching command-line surface.
- An out-of-process .NET 10 Cartographer process using JSON-RPC 2.0.
- Deterministic discovery of .NET solutions, C# projects, package.json projects,
  project references, and relevant workspace files.
- Queryable workspace orientation with multi-valued project roles, target and
  build dimensions, executable .NET and package-script commands, structured
  repository conventions, governing instruction references, and explicit
  included/pending source coverage.
- A versioned SQLite Atlas with WAL, atomic generations, stable entity IDs,
  canonical containment and project-reference relations, and source evidence.
- Atlas summary and exact entity queries through VS Code, JSON-RPC, and CLI.
- Cross-process tests proving persistence, stable identity, and rollback to the
  previous generation after failed discovery.

This is a structural Atlas, not a semantic C# index. Roslyn symbols, code usages,
database objects, TypeScript/React semantics, agent tools, and Context Packs are
still planned work.

## Commands

- `Kraken Atlas: Show Status`
- `Kraken Atlas: Build Atlas`
- `Kraken Atlas: Show Atlas Summary`
- `Kraken Atlas: Show Workspace Orientation`
- `Kraken Atlas: Lookup Entity`
- `Kraken Atlas: Restart Cartographer`
- `Kraken Atlas: Export Diagnostics`
- `Kraken Atlas: Open Architecture Plan`

The diagnostic export contains environment and Atlas metadata such as local
paths, versions, counts, timings, capabilities, and errors. It does not include
source file bodies or project and entity inventories. Review the JSON before
sharing it because local paths can still be sensitive.

## Development

```powershell
npm install
npm test
npm run check:vsix
```

The VSIX is written to the parent `pack-artifacts` directory.

Invited testers should follow [the alpha testing guide](ALPHA_TESTING.md). See
[privacy and local-data behavior](PRIVACY.md) before sharing diagnostics. The
project is currently `UNLICENSED`; invited evaluation does not grant
redistribution rights.

## Cartographer CLI

```powershell
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll build --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll summary --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll orientation --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll entity --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3 --stable-key project:<hash>
```

## Planning

Start with [the planning index](docs/planning/README.md). The implementation is
gated by the phase exits and benchmark requirements in that planning set.
