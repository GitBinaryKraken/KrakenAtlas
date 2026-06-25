# Where We Left Off

Date: 2026-06-25

## Current State

The `main` branch has a clean committed checkpoint at:

```text
1434700 Add pattern-aware Atlas querying
```

After that commit, we continued with four feature slices: making `where-to-add` show explicit pattern-fit guidance, adding a cautious architecture-hotspots query inspired by the Graphify/NetworkX competitor review, adding initial pattern-drift candidates, and adding `plan-change` as the one-step implementation planning query.

## Uncommitted Work In Progress

Files currently changed:

- `src/query/queryService.ts`
- `src/format/agentFormatter.ts`
- `test/queryService.test.ts`
- `test/agentFormatter.test.ts`
- `src/cli.ts`
- `src/extension.ts`
- `package.json`
- `src/findings/codeHealthDetector.ts`
- `src/model/records.ts`
- `README.md`
- `GETTING_STARTED.md`
- `CHANGELOG.md`

What changed:

- `where-to-add` now derives a `patternFit` evidence record from scoped detected patterns and recommended edit files.
- Agent output renders this as a compact `Pattern fit` line near the top of the evidence section.
- `query hotspots` now ranks architecture hotspot candidates from relationship volume, relationship-type diversity, and shared graph endpoints.
- Hotspot output is cautious by design: central files are shared context and risk surfaces, not default edit targets.
- `query drift` now reports initial pattern-drift candidates:
  - controllers directly accessing repository/data relationships when controller-service delegation is already detected
  - services directly querying/writing DbSet-style data when service-to-repository and repository data-flow patterns are already detected
- `query plan-change` now combines likely edit files, pattern fit, hotspot/drift risk checks, and a bounded context-pack command.
- The CLI, Command Palette, VS Code language-model tool manifest, README, getting-started guide, agent skill, and changelog expose the new planning workflow.
- Tests verify raw query evidence, compact rendered output, package contributions, and CLI help.

Verification:

```text
npm test
64/64 passing
```

## Why This Slice Matters

This moves Atlas from "here are likely files" toward "here is the local pattern to copy." That is the core product direction from `NEXT_STEPS.md`: pattern-aware editing rather than generic graph browsing.

## Competitor Signal: Graphify + NetworkX

Article reviewed:

```text
https://www.marktechpost.com/2026/06/24/using-graphify-and-networkx-to-map-python-codebase-structure-with-god-nodes-communities-and-architecture-visualizations/
```

Key ideas from the article:

- Graphify extracts a local code knowledge graph from a Python and SQL sample app.
- NetworkX is used to calculate relationship counts, centrality, betweenness, communities, and shortest paths.
- The tutorial calls highly connected components "god nodes."
- It generates both static and interactive graph visualizations.
- It also demonstrates graph queries such as "what connects auth to the database?", path lookup, and symbol explanation.

Atlas implications:

- Community demand for architecture mapping is real and current.
- "God node" and community detection are useful concepts, but Atlas should translate them into edit guidance.
- Atlas should prefer agent-readable answers over visual-first graph exploration.
- The strongest opportunity is a query like `architecture hotspots` or `pattern drift`, not a general-purpose graph canvas.

## Recommended Next Steps

1. Commit the current `plan-change` slice as a clean checkpoint.
2. Run a CLI smoke test against a real mapped workspace:
   - `kraken-atlas query plan-change "requested change" --workspace . --context WebUI --format agent`
   - `kraken-atlas query hotspots --workspace . --context WebUI --format agent`
   - `kraken-atlas query drift --workspace . --context WebUI --format agent`
   - `kraken-atlas context plan-change "requested change" --workspace . --context WebUI --format md`
3. Add the next cautious pattern-drift candidate:
   - form post or endpoint exists without nearby validation
4. Add pattern-specific feedback prompts to `ALPHA_FEEDBACK.md`.

## Product Positioning Reminder

Graphify shows the graph.

Atlas should answer:

- What should I edit?
- Which pattern should I copy?
- Which central files should I avoid unless the task truly needs them?
- Where might the repo be drifting from its own architecture?
