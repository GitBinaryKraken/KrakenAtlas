# Kraken Atlas Product Requirements

## Mission

Kraken Atlas gives AI coding agents a trustworthy, locally queryable relationship map of a codebase so they can answer structural questions before reading broad areas of source.

## Primary User

An AI coding agent working in an unfamiliar or large repository that needs to locate declarations, references, callers, implementations, injected dependencies, routes, and connected behavior with a small context budget.

## Priority Platform

.NET Core and C# are the highest-priority platform. Roslyn semantic analysis over actual solutions and projects is the default path. Other supported languages are secondary until C# map accuracy is demonstrated across the verification matrix.

## Core Jobs

1. Build a persistent map from a local repository.
2. Identify projects, files, symbols, and source locations.
3. Resolve semantic references and typed relationships.
4. Let an agent query one symbol or relationship without loading the entire graph.
5. Traverse a small connected flow from a known route, symbol, or term.
6. Communicate provenance, confidence, ambiguity, and analyzer gaps.

## Required Query Surface

- `project`
- `symbol`
- `references`
- `relationships`
- `flow`
- `search`

The CLI, VS Code commands, language-model tool schema, formatter, and generated agent instructions must expose the same set.

## Accuracy Requirements

- A map fact points to the correct file and line range.
- Semantic relationships use resolved symbol identities when Roslyn can provide them.
- Cross-project references work through `ProjectReference` boundaries.
- Overloads, generics, interfaces, inheritance, partial types, and modern C# syntax do not collapse into misleading identities.
- Unsupported or unresolved behavior remains visibly partial rather than being presented as certain.
- Incremental rebuilds produce the same graph facts as clean rebuilds for unchanged inputs.
- Map generation remains usable when a repository is partially broken; fallback evidence must be distinguishable from project-loaded semantic evidence.

## Verification Requirement

Every analyzer capability needs a focused fixture and assertions for:

- expected symbols
- expected references
- expected incoming and outgoing relationships
- exact source locations
- confidence and provenance
- ambiguity or unresolved cases
- negative cases that must not create an edge

Real-repository evaluations supplement fixtures but do not replace them.

## Non-Goals For This Phase

- recommending where code should be added
- planning implementation changes
- detecting local conventions or patterns
- scoring hotspots or edit likelihood
- producing code-health, orphan, drift, or duplicate findings
- broad narrative architecture reports

These ideas are preserved on `july13th-offtrack` and may return only after the core map has measurable accuracy.

## Success Criteria

1. The .NET verification matrix is covered by deterministic tests.
2. Direct queries return exact, useful evidence for representative multi-project ASP.NET Core repositories.
3. Known blind spots are documented and surfaced to querying agents.
4. Adding a new framework structure means extending the graph vocabulary and fixture corpus, not adding recommendation heuristics.
