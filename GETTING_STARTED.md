# Getting Started

## Build A Map

From a repository root:

```powershell
kraken-atlas build --workspace .
kraken-atlas doctor --workspace . --format agent
kraken-atlas query project --workspace . --format agent
```

The build writes `.kraken-atlas/index.sqlite` plus inspectable JSON/JSONL records. Run `doctor` after a build or update before relying on query results.

## Start With An Anchor

Find a declaration:

```powershell
kraken-atlas query symbol "OrderService" --workspace . --context Orders --format agent
```

Find semantic uses:

```powershell
kraken-atlas query references "MyApp.Orders.OrderService.CreateAsync" --workspace . --format agent
```

Inspect graph neighbors:

```powershell
kraken-atlas query relationships "MyApp.Orders.IOrderService" --workspace . --format agent
kraken-atlas query relationships "MyApp.Orders.OrderService.CreateAsync" --edge CALLS --workspace . --format agent
```

Trace a bounded behavior:

```powershell
kraken-atlas query flow "POST /api/orders" --workspace . --context Web --format agent
```

Search when the exact symbol is unknown:

```powershell
kraken-atlas query search "CreateOrder" --workspace . --context Orders --format agent
```

## Read Results

- Prefer exact symbol or node IDs for follow-up queries.
- Treat file paths and line ranges as evidence boundaries.
- Check confidence and provenance before treating an edge as semantic fact.
- An empty result may indicate missing analyzer coverage, an unhealthy map, or an ambiguous query. It is not proof that no relationship exists.
- Use `--context` when the same type or member name appears in multiple projects.

## Give An Agent Access

```powershell
kraken-atlas install-agent --workspace .
kraken-atlas install-skill --workspace .
```

The generated instructions keep the agent on the direct map workflow: health, project, anchor, references, relationships, bounded flow, then focused source inspection.

## Update A Map

```powershell
kraken-atlas update --workspace .
kraken-atlas doctor --workspace . --format agent
```

Use a clean `build` when changing analyzer versions or when `doctor` reports an incompatible or incomplete map.

## VS Code

Use the Command Palette for:

- Kraken Atlas: Build Code Map
- Kraken Atlas: Update Code Map
- Kraken Atlas: Check Map Health
- Kraken Atlas: Show Project Summary
- Kraken Atlas: Find Symbol
- Kraken Atlas: Find References
- Kraken Atlas: Show Relationships
- Kraken Atlas: Trace Feature Flow
- Kraken Atlas: Search Map
- Kraken Atlas: Export Context Pack

The context pack accepts the same direct query types and should be generated only after narrowing to a useful anchor.

## Troubleshooting

If the .NET analyzer cannot load a solution or project, run its project directly to see MSBuild diagnostics:

```powershell
dotnet run --project analyzers/dotnet/KrakenAtlas.RoslynAnalyzer/KrakenAtlas.RoslynAnalyzer.csproj -- --workspace . --output .kraken-atlas/manual-dotnet
```

Kraken Atlas falls back to loose C# files when no MSBuild input can be loaded. That keeps partial repositories queryable, but project references and framework compilation context may be incomplete.
