# Where We Left Off

Updated July 13, 2026.

## Product Reset

Kraken Atlas is again centered on its original purpose: a local, AI-agent-queryable relationship map of a codebase. .NET Core/C# map correctness is the highest priority. The former recommendation, planning, pattern, hotspot, and code-health direction is preserved on `july13th-offtrack` and removed from the current `main` surface.

## Current Implementation

- CLI, VS Code, agent-tool, formatter, and context surfaces expose `project`, `symbol`, `references`, `relationships`, `flow`, and `search`.
- Map storage contains files, symbols, semantic references, relationships, project metadata, and SQLite query indexes.
- The C# analyzer loads real `.sln`, `.slnx`, and `.csproj` inputs with Roslyn `MSBuildWorkspace`.
- Loose-file C# analysis remains as a fallback for incomplete repositories.
- Cross-project semantic calls, primary-constructor injection, project references, DI registration, and Minimal API routes have focused fixture coverage.
- Razor and web analysis remain supported but are secondary to .NET verification.

## Next Work

Work through [NEXT_STEPS.md](./NEXT_STEPS.md), starting with P0 fixture coverage for solution loading, C# symbol identity stress cases, controllers, Minimal APIs, and dependency injection. Every change should improve observable graph accuracy rather than infer implementation advice from the graph.

## Verification Commands

```powershell
npm run compile
npm test
dotnet build analyzers/dotnet/KrakenAtlas.RoslynAnalyzer/KrakenAtlas.RoslynAnalyzer.csproj
```

The governing scope is [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md).
