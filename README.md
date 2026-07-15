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

Version `0.3.0` completes the Phase 1 Walking Cartographer. It contains:

- A thin VS Code workspace extension and matching command-line surface.
- An out-of-process .NET 10 Cartographer process using JSON-RPC 2.0.
- Deterministic discovery of .NET solutions, C# projects, project references,
  and relevant workspace files.
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
- `Kraken Atlas: Lookup Entity`
- `Kraken Atlas: Restart Cartographer`
- `Kraken Atlas: Open Architecture Plan`

## Development

```powershell
npm install
npm test
npm run check:vsix
```

The VSIX is written to the parent `pack-artifacts` directory.

## Cartographer CLI

```powershell
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll build --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll summary --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll entity --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3 --stable-key project:<hash>
```

## Planning

Start with [the planning index](docs/planning/README.md). The implementation is
gated by the phase exits and benchmark requirements in that planning set.
