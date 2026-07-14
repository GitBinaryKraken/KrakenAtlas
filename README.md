# Kraken Atlas

Kraken Atlas builds a local, AI-agent-queryable relationship map of a codebase. Its first priority is accurate .NET Core and C# mapping: projects, symbols, semantic references, calls, type relationships, dependency injection, ASP.NET Core routes, data access, configuration, and source locations.

The product question is simple: **can an agent ask a precise question about code relationships and receive trustworthy, source-backed graph facts?**

## Current Focus

- Load real SDK-style .NET projects and solutions through Roslyn `MSBuildWorkspace`.
- Resolve C# symbols and references with project compilation context.
- Preserve graph provenance, confidence, file paths, and line ranges.
- Verify mapping against small fixtures representing distinct .NET code structures.
- Offer direct, bounded queries suitable for terminal and VS Code agents.

Razor, JavaScript, TypeScript, and React mapping remain available as secondary coverage. Recommendation engines, implementation planning, convention detection, hotspot scoring, code-health findings, orphan review, and duplicate review are outside the current product surface. Their previous implementation remains recoverable from the `july13th-offtrack` branch.

See [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md) for the product contract and [NEXT_STEPS.md](./NEXT_STEPS.md) for the mapping verification matrix.

## Install

From a packaged release:

```powershell
npm install --save-dev kraken-atlas
npx kraken-atlas build --workspace .
npx kraken-atlas doctor --workspace . --format agent
```

From this repository:

```powershell
npm install
npm run compile
node dist/cli.js build --workspace .
node dist/cli.js doctor --workspace . --format agent
```

The VS Code extension exposes the same build, health, and direct query workflow through the Command Palette.

## Query The Map

```powershell
kraken-atlas query project --workspace . --format agent
kraken-atlas query symbol "OrderService" --workspace . --format agent
kraken-atlas query references "MyApp.Services.OrderService.CreateAsync" --workspace . --format agent
kraken-atlas query relationships "MyApp.Services.IOrderService" --workspace . --format agent
kraken-atlas query relationships "MyApp.Services.OrderService.CreateAsync" --edge CALLS --workspace . --format agent
kraken-atlas query flow "POST /api/orders" --workspace . --format agent
kraken-atlas query search "CreateOrder" --workspace . --format agent
```

Use `--context ProjectOrFolderName` to disambiguate repeated names. Once a query returns an exact graph ID, use that ID for subsequent hops.

Available query types:

| Query | Purpose |
| --- | --- |
| `project` | Inspect map scope, record counts, languages, project types, and analyzer runs. |
| `symbol` | Find declarations and exact symbol IDs. |
| `references` | Find semantic uses of a symbol. |
| `relationships` | Inspect incoming and outgoing graph edges, optionally filtered by `--edge`. |
| `flow` | Traverse a bounded connected behavior from a route, symbol, or search anchor. |
| `search` | Find map records from exact source-oriented terms. |

## .NET Analysis

The bundled analyzer discovers `.sln`, `.slnx`, and `.csproj` inputs and loads them with `MSBuildWorkspace`. This preserves real project references, framework references, parse options, and compilation settings. When no project input can be loaded, Kraken Atlas falls back to loose-file C# parsing so incomplete source drops can still produce partial evidence.

Current C# relationships include:

- `CONTAINS`, `IMPLEMENTS`, and `INHERITS`
- `CALLS` plus semantic call references
- `INJECTS` and `REGISTERS`
- `MAPS_ROUTE` and `REQUIRES_AUTH`
- `USES_CONFIG_KEY`, `BINDS_OPTIONS`, and `USES_OPTIONS`
- `USES_DBSET`, `DBSET_FOR`, `QUERIES`, and `WRITES`

Every relationship is useful only to the degree that it is correctly resolved and located. Adding more relationship kinds is secondary to proving the existing kinds across representative code structures.

## Generated Map

The `.kraken-atlas` folder contains:

```text
.kraken-atlas/
  manifest.json
  project.json
  files.jsonl
  symbols.jsonl
  references.jsonl
  relationships.jsonl
  index.sqlite
```

`index.sqlite` is the query index. JSON/JSONL files keep the map inspectable and portable.

## Agent Use

```powershell
kraken-atlas install-agent --workspace .
kraken-atlas install-skill --workspace .
```

These commands install project-local instructions that teach agents to check map health, find an exact anchor, inspect direct relationships, and open only evidence-backed source slices.

## Development

```powershell
npm run compile
npm test
dotnet build analyzers/dotnet/KrakenAtlas.RoslynAnalyzer/KrakenAtlas.RoslynAnalyzer.csproj
```

Mapping changes should include a fixture that isolates the relevant .NET structure and assertions for expected nodes, edges, locations, confidence, and important negative cases. See [ALPHA_FEEDBACK.md](./ALPHA_FEEDBACK.md) when reporting a mapping gap.

## Influences And Competition

- [bbajt/csharp-code-map](https://github.com/bbajt/csharp-code-map) demonstrates the value of persistent Roslyn semantic indexing over real solutions and projects.
- [Graphify](https://github.com/Graphify-Labs/graphify) demonstrates broad structure coverage and a fixture-driven way to communicate graph confidence.

Kraken Atlas is aiming at the agent workflow: a local map with compact direct queries, transparent evidence, and especially strong .NET Core/C# relationship accuracy.
