# Alpha Feedback

The most useful feedback is a relationship fact Kraken Atlas missed, invented, misidentified, or located incorrectly in a .NET Core/C# code structure.

## Capture The Query

```powershell
kraken-atlas doctor --workspace . --format agent
kraken-atlas query project --workspace . --format agent
kraken-atlas query symbol "RelevantName" --workspace . --context ProjectName --format agent
kraken-atlas query references "Exact.Symbol.Id" --workspace . --format agent
kraken-atlas query relationships "Exact.Symbol.Id" --workspace . --format agent
```

## Report

Include:

- the smallest source structure that reproduces the issue
- project and target-framework information
- the exact command and output format
- expected symbols, references, and relationships
- actual missing or incorrect records
- expected file and line location
- whether the solution and projects build successfully
- whether source generation, reflection, dynamic dispatch, or framework conventions are involved

## High-Value Structures

- multi-project solutions and `ProjectReference` chains
- overloaded, generic, extension, explicit-interface, and async methods
- records, primary constructors, file-scoped namespaces, partial types, and nested types
- ASP.NET Core controllers, Minimal APIs, Razor Pages, Blazor, middleware, filters, and authorization
- built-in and third-party dependency injection registration
- EF Core contexts, sets, queries, writes, and entity configurations
- MediatR or CQRS request/handler flow
- options binding and configuration keys
- generated code, source generators, conditional compilation, and partially broken builds

## Preferred Regression Test

A strong fix adds a focused fixture plus assertions for expected nodes, edges, exact locations, confidence/provenance, and a nearby negative case. Large proprietary repositories are useful validation targets, but a minimal reproducible structure gives the project a durable test.
