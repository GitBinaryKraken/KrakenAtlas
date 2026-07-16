# Tactical Retrieval Field Feedback

Date: 2026-07-16

Release response: 0.9.4

## Purpose

This note records an agent's first independent use of Kraken Atlas against the
Kelp workspace and the acceptance criteria derived from that run. The report is
treated as product evidence rather than as a one-off bug transcript. No Kelp
source or generated Atlas is included in the extension.

## Reported Workflow

The agent successfully discovered the agent-neutral MCP tools, observed an
unbuilt Atlas, built it, and queried orientation and summary. The initial build
reported 2 solutions, 11 projects, 673 files, 6,740 entities, 16,765 relations,
and 10 project dependencies in about 42 seconds.

Orientation correctly returned the C# and React/Next projects, project kinds,
target frameworks, package manager facts, build/run/test commands, and the
governing `AGENTS.md`. The failure began when the agent moved from workspace
orientation to tactical retrieval.

The task was to find where `KelpApi` registers services and exposes HTTP
endpoints. The first Context Pack required a seed and mixed `AdminTools`,
`Kelp2025_WebUI`, and `KelpApi` candidates. Seeding `KelpApi.Controllers`
returned only the namespace and a short `AliveController.cs` excerpt.

Two broad `search_code` probes returned no matches:

```text
KelpApi MapControllers AddControllers AddHostedService Program
KelpApi.Controllers Route HttpGet HttpPost ApiController
```

Direct source search immediately found `AddControllers` at Program line 109,
`AddHostedService<ImageProcessingBackgroundWorker>` at line 165,
`MapControllers` at line 206, and many controller HTTP/route attributes.

## Engineering Diagnosis

| Gap | Cause |
| --- | --- |
| Multi-concept searches returned no matches | Entity search treated the full phrase as one substring and did not search signatures, kinds, projects, or paths term by term. |
| Startup calls were invisible | Common ASP.NET `Add*` and `Map*` invocations were not represented as first-class framework entities. |
| Attribute searches failed | Controller endpoint signatures did not carry their method/type attribute names. |
| The task mixed sibling projects | Seed scoring did not sufficiently reward an explicitly named owning project. |
| Namespace packs were thin | Default surface traversal excluded containment and visited high-fanout children before framework wiring. |
| Packs became repetitive | Selection ranked graph distance without task concepts or per-kind diversity. |
| Build outputs diluted discovery | Exact `bin`/`obj` exclusions did not cover local names such as `bin_temp` and `obj_temp`. |

## 0.9.4 Response

- Tokenize multi-concept queries while retaining exact full-query matching.
- Search entity names, qualified names, signatures, kinds, languages, projects,
  project paths, and source paths with deterministic weighted ranking.
- Represent common ASP.NET service configuration, endpoint mapping, and hosted
  service calls as framework entities with source evidence.
- Connect `AddControllers` to `MapControllers`, `MapControllers` to controller
  namespaces and endpoint entities, and hosted registrations to worker types.
- Include controller and method attribute names in endpoint signatures.
- Reward explicit project qualifiers during task resolution while preserving
  `needs_seed` for cross-project ambiguity.
- Traverse bounded containment for Context Packs, prioritize framework edges
  before code fan-out, rank candidates by task terms, preserve the seed first,
  reuse otherwise idle assessment budget, and cap repetitive kinds.
- Exclude `.next`, `.turbo`, `artifacts`, `publish`, `TestResults`, and directory
  names beginning with `bin_` or `obj_`.

## Acceptance Result

The same unseeded Kelp task now resolves automatically. At a 5,000-token budget
with 12-line source limits, the pack contains:

- `KelpApi startup AddControllers` with `KelpApi/Program.cs` evidence;
- `KelpApi startup MapControllers` with `KelpApi/Program.cs` evidence;
- six representative `http_endpoint` entities with source excerpts from their
  actual controller action declarations;
- three controller classes;
- the KelpApi project and its focused build command; and
- 12 total items, 10 source slices, and an estimated size of 4,570 tokens.

The regression suite reproduces the unseeded workflow on an owned fixture and
separately verifies multi-term search, endpoint attributes, hosted-service
registration, generated-output filtering, and controller action source slices.

## Remaining Work

Broad API-surface queries still summarize rather than enumerate every endpoint.
Feature- or route-specific queries should rank the relevant endpoint and its
downstream service/data route. Middleware/filter attachment, richer endpoint
contract coverage, and the TypeScript/React-to-API route remain 1.0 work.
