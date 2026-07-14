# Kraken Atlas Agent Skill

Use Kraken Atlas to answer relationship questions before opening broad source trees.

## Workflow

1. Check the map with `kraken-atlas doctor --workspace . --format agent`.
2. Inspect scope with `kraken-atlas query project --workspace . --format agent`.
3. Find an anchor with `symbol` or `search`.
4. Ask for semantic usage with `references`.
5. Ask for incoming and outgoing graph facts with `relationships`.
6. Use `flow` for one bounded connected behavior.
7. Open only the returned source locations needed to verify or implement the task.

## Commands

```powershell
kraken-atlas query symbol "ClassOrMethodName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query references "Namespace.Type.Method" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query relationships "Namespace.Type" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query relationships "Namespace.Type.Method" --edge CALLS --limit 30 --workspace . --format agent
kraken-atlas query flow "route, service, or behavior" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query search "exact source term" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas context relationships "Namespace.Type" --workspace . --context ProjectOrFolderName --format md
```

## Relationship Playbooks

Callers and callees: query `references` for semantic use sites, then filter `relationships` by `CALLS`.

Interfaces and DI: query the interface or implementation and inspect `IMPLEMENTS`, `INJECTS`, and `REGISTERS`.

ASP.NET Core: start at a route or endpoint and inspect `MAPS_ROUTE`, `REQUIRES_AUTH`, `CALLS`, and service relationships.

Data access: query the entity, `DbContext`, or repository and inspect `USES_DBSET`, `DBSET_FOR`, `QUERIES`, and `WRITES`.

Configuration: query the options type or key and inspect `BINDS_OPTIONS`, `USES_OPTIONS`, and `USES_CONFIG_KEY`.

## Evidence Rules

- Prefer exact graph IDs over repeated partial-name searches.
- Treat confidence, provenance, path, and line range as part of each fact.
- Do not infer non-use from an empty reference list.
- Verify reflection, generated code, source generators, dynamic dispatch, and framework conventions in source when static evidence is incomplete.
- Keep each follow-up to one graph hop unless a bounded `flow` query is clearer.

Kraken Atlas maps code relationships. It does not choose edit locations or produce implementation plans.
