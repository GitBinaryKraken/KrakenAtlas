# AI Agent Query Requirements

## Purpose

This document describes what a code-writing AI agent needs to query from Kraken
Atlas. The goal is not to expose the largest possible graph. The goal is to
return the smallest complete, evidence-backed answer that lets an agent orient,
reason, edit, test, and review code without repeatedly searching and reading the
same repository content.

These requirements are written from the consumer's point of view. The Atlas
schema and analyzers should be judged by whether they can answer these questions
reliably.

## Query Design Rules

### Return Facts, Not a Graph Dump

A query should return a bounded result with exact identities, useful source
ranges, and the relationships that explain the result. An agent rarely needs
every node in a project or every neighbor of a high-degree symbol.

### Keep Code Use and Documentation Separate

Kraken Atlas must distinguish two different questions:

1. **Where is this code object used?** This is a compiler, framework, SQL, or
   other code-analysis query.
2. **What documentation discusses this code object?** This is a documentation
   relationship query.

A README that mentions `OrderService` is not a code reference to
`OrderService`. A `find_usages` result must not contain README, ADR, or runbook
mentions. A `get_documentation_for_entity` result must not be represented as a
caller, reference, or dependency.

### Prefer Exact Identity

Once a query resolves a symbol, subsequent queries should use its stable entity
ID or key. Display names, basenames, and unqualified type names are discovery
inputs, not durable identity.

### Make Ambiguity Visible

If a query could mean several overloads, target frameworks, route templates,
database objects, or symbols, return ranked candidates and the distinguishing
details. Never silently choose the first candidate.

### Be Directional and Relation-Aware

The agent must be able to select relation type, direction, scope, and depth.
Callers and callees, readers and writers, implementations and interfaces, and
incoming and outgoing dependencies answer different questions.

### Be Freshness-Aware

Every response should state the Atlas generation, unsaved-document overlay, and
known stale or failed projects. Source slices should be checked against the
indexed content hash before being returned.

### Be Budgeted and Pageable

Every potentially large query needs a result limit, a token or byte budget, a
stable sort, truncation metadata, and a continuation cursor. Truncation must not
silently remove the seed or the highest-value evidence.

## Query Families

### 1. Workspace Orientation

An agent entering an unfamiliar workspace should be able to ask:

- What solutions and projects exist?
- Which projects are applications, libraries, tests, workers, database projects,
  or frontend applications?
- What target frameworks, package managers, and major frameworks are present?
- What are the executable entry points, ASP.NET Core endpoints, React routes,
  hosted services, migration projects, and primary database contexts?
- What commands build, test, run, format, generate, package, and migrate each
  project or the complete workspace?
- Which repository rules and conventions govern the task, what scope does each
  rule cover, and which source has precedence when instructions conflict?
- What are the most important Landmarks by project and relation dimension?
- Which projects failed to index or have degraded semantic fidelity?
- How fresh is the Atlas relative to the workspace and unsaved editor buffers?

These are canonical Atlas facts, not tasks left for the client to reconstruct by
reading filenames. The orientation response should return a compact project
topology, project roles, hosts and entry points, build/configuration matrix,
command catalog, governing-rule summary, completeness, and suggested next
queries. Prose bodies remain in the separate documentation plane and are
retrieved only when requested.

The primary operation is `get_workspace_orientation(scope?, configuration?,
include_commands?, include_conventions?)`. `get_atlas_summary` remains the
smaller health and count response.

### 2. Symbol Discovery and Definition

An agent should be able to:

- Search by simple name, qualified name, signature, route, database name, file,
  namespace, project, entity kind, or language.
- Resolve overloads, generic arity, partial declarations, target frameworks, and
  duplicate frontend/backend names.
- Retrieve signatures, documentation comments, attributes, visibility,
  containing entities, declaration locations, and generated status.
- Retrieve base types, interfaces, derived types, implementations, and overrides.
- Ask which source declaration is canonical for an edit and which locations are
  generated or metadata-only.

Search should return lightweight candidates. `get_symbol` should return detailed
facts for an exact entity.

### 3. Code Usages and Dependencies

For an exact code or database entity, an agent should be able to query:

- All semantic references with role and source range.
- Direct callers and callees.
- Constructor and factory creation sites.
- Type uses in parameters, returns, fields, properties, generic arguments, and
  constraints.
- Reads, writes, subscriptions, event publications, and handler registrations.
- Implementations, overrides, dispatch candidates, and extension-method use.
- Incoming and outgoing project, module, package, and file dependencies.
- Tests that directly or transitively exercise the entity.
- ASP.NET Core endpoints, DI registrations, middleware, and policies connected to
  the entity.
- React components, hooks, routes, and request clients connected to the entity.
- Database objects mapped, queried, read, written, executed, or migrated by the
  entity.

The core operation is `find_usages`. Its default relation domain is `code` and
it never returns external documentation entities.

### 4. Routes and Execution Questions

An agent should be able to ask:

- How can execution reach this method from an entry point?
- What does this endpoint call before it reaches the database?
- Which React route and component trigger this ASP.NET Core endpoint?
- Which implementation can receive this interface call?
- What path connects this configuration value to the behavior it controls?
- Which migration introduced a table or column used by this query?
- Is there more than one plausible path, and where does static resolution become
  dynamic or ambiguous?

Routes should be directed, profile-specific, evidence-backed, and bounded. They
should support execution, dependency, HTTP, data, and full-stack profiles.

### 5. Change Impact and Test Selection

Before editing, an agent should be able to query:

- What code, contracts, endpoints, database objects, and frontend clients may be
  affected if this entity changes?
- Which callers rely on a particular overload or interface member?
- Which serialized DTOs cross a process or HTTP boundary?
- Which EF Core migrations, mappings, and queries depend on an entity property?
- Which tests are closest to the changed entities and which projects need to be
  built or tested?
- Does a proposed rename or move break documentation links, routes, SQL strings,
  or generated clients?

Impact queries must distinguish proven direct impact from transitive or
heuristic impact.

### 6. Database Questions

An agent working on data access should be able to ask:

- Which code entity maps to this table, view, column, key, index, procedure, or
  function?
- Which methods read from or write to this object?
- Where is this object configured in EF Core?
- Which migration created, renamed, or removed it?
- What foreign-key paths connect two entity or table types?
- Which endpoint or React feature can reach this database object?
- Which raw SQL statements reference it, under which SQL dialect, and with what
  resolution quality?
- Does the current code model disagree with the latest migration snapshot?

Database results need both logical object identity and the exact code or SQL
evidence that established the relationship.

### 7. Change-Aware Queries

When a diff or working tree is available, an agent should eventually be able to
ask:

- Which Atlas entities and relations changed in this diff?
- What behavior or public contract changed, rather than which lines changed?
- Which Routes were added, removed, or redirected?
- What is the impact boundary of the current uncommitted work?
- Which tests and documentation are now likely stale?
- Did a migration, endpoint contract, database mapping, or frontend request
  change without its corresponding counterpart?

This requires generation and snapshot comparison. It is distinct from Git text
diffing, although Git can provide the changed-file seed.

### 8. Context Pack Construction

An agent should be able to provide a task, optional seeds, and a token budget and
receive:

- Exact seed entities and any unresolved ambiguity.
- The minimum source bodies needed to make the change.
- Supporting signatures rather than full bodies where possible.
- Relevant Routes, endpoint contracts, database mappings, and tests.
- Inclusion reasons and source evidence.
- Atlas freshness, exclusions, omitted candidates, and continuation guidance.

Context Packs must not silently include documentation. The request uses a
`documentation_policy`:

- `none`: code and database facts only; the default for implementation and usage
  queries.
- `linked`: include documentation sections already linked to selected entities.
- `search`: run a separate documentation search using the task text, then merge
  selected sections with a separate documentation token allowance.

The response reports code tokens and documentation tokens separately.

### 9. Feature Implementation Planning

When asked to add a feature to an existing project, an agent should be able to
retrieve a bounded implementation plan rather than manually reconstructing the
feature from repeated repository searches. Required questions include:

- What existing feature is the closest structural and behavioral precedent?
- What entry point, runtime composition, contracts, value flow, side effects,
  failure paths, configuration, and tests form this feature slice?
- Which entities `must_change`, are `likely_change`, or only require `verify`?
- Which files are canonical edit locations and which are generated outputs?
- Which focused build, test, generation, migration, and formatting commands are
  required?

Planned composite operations include `find_similar_features`,
`get_feature_blueprint`, `trace_value_flow`, `get_runtime_composition`,
`get_contract_boundary`, `get_failure_paths`, `get_configuration_matrix`,
`get_change_surface`, `get_related_tests`, and
`build_feature_context_pack`.

The full workflow and required relationship dimensions are defined in
[AI Feature Implementation Workflow](FEATURE_IMPLEMENTATION_WORKFLOW.md).

Most answers should be available from exact node knowledge rather than generated
from scratch for every task. `get_entity_context` selects orientation, feature,
behavior, contract, effect, change-surface, failure, lifecycle, test,
documentation, and assessment dimensions for one canonical entity.

Automatically reproducible facts remain separate from reusable AI conclusions.
Agents can record typed claims through explicit analysis sessions. Stored claims
include evidence, dependencies, provenance, scope, confidence, and freshness;
they never overwrite compiler or framework facts. The full contract is defined
in [Node Knowledge and Assessment Model](NODE_KNOWLEDGE_MODEL.md).

Agents write those claims through one versioned JSON contract and the
`decorate_nodes` operation defined in
[Node Decoration Command](NODE_DECORATION_COMMAND.md). Agents never write Atlas
tables directly or mix assessment payloads into ordinary read queries.

The update format distinguishes architectural role classification, feature and
pattern membership, assessed edges, behavior, effects, contracts, failures,
lifecycle, change guidance, tests, documentation, Landmarks, precedents,
dynamic-target resolution, knowledge gaps, and review of earlier assessments.
The autonomous recording policy is defined in
[AI Self-Enrichment](AI_SELF_ENRICHMENT.md).

## Documentation Relationship Plane

Documentation belongs in the Atlas because it explains architecture and code,
but it occupies a separate relation domain and search index.

### Documentation Entities

- `document`
- `document_section`
- `adr`
- `runbook`
- `guide`
- `api_document`
- `database_document`
- `release_note`
- `diagram`

Documents are split into addressable sections. Queries should return the smallest
relevant section with its heading path and source anchor rather than the entire
document.

### Documentation Relations

- `documents`: general explanation of an entity.
- `explains`: detailed behavior or rationale.
- `decides`: an ADR decision governing an entity or subsystem.
- `specifies`: a contract or required behavior.
- `runbook_for`: operational procedure for an entity or endpoint.
- `example_for`: usage example.
- `mentions`: lexical mention without stronger evidence.
- `supersedes`: one document or section replaces another.

These relations use the `documentation` domain. They are never aliases for code
`references`, `calls`, `uses_type`, or `reads_from` relations.

### Documentation Link Evidence

Link resolution should prefer:

1. Explicit stable Kraken Atlas entity links or configured documentation directives.
2. Compiler-resolved XML documentation `cref` values.
3. Markdown links to source files, symbols, routes, or database objects.
4. Exact qualified symbol, endpoint, or database object identifiers.
5. OpenAPI operation and route matches.
6. Ambiguous lexical mentions, stored only as `mentions` with candidates.

Every documentation relation records the document section, source range,
resolution method, target entity, Atlas generation, and confidence when the link
is heuristic.

### Documentation Freshness

A documentation link records the target signature or contract fingerprint at
the time it was verified. Query results report:

- `current`: the target identity and relevant fingerprint still match.
- `possibly_stale`: the target exists but its contract changed.
- `broken`: the target no longer resolves.
- `unverified`: only heuristic or incomplete evidence is available.
- `superseded`: a newer document explicitly replaces this section.

Freshness is a warning signal, not proof that prose is correct.

### Dedicated Documentation Queries

- `search_documentation(query, kinds?, project?, limit?, freshness?)`
- `get_documentation_for_entity(entity, relation_kinds?, document_kinds?, freshness?, limit?)`
- `get_code_for_documentation(document_or_section, relation_kinds?, limit?)`
- `get_documentation_health(scope?, include_broken?, include_stale?)`

`get_documentation_for_entity` returns section excerpts, heading paths, relation
types, link evidence, freshness, and source anchors. It does not return code
usages. `get_code_for_documentation` provides the reverse mapping for updating or
reviewing docs.

## Response Contract for Agent-Facing Queries

Every result should include, as applicable:

- Query kind and normalized scope.
- Atlas generation and unsaved overlay version.
- Exact seed identity or candidate resolutions.
- Stable entity IDs and human-readable qualified identities.
- Relation domain, kind, direction, and path distance.
- Source file and precise range for every editable or evidentiary item.
- Provenance, resolution state, and ambiguity candidates.
- Why the result was included and how it was ranked.
- Truncation, omitted count, continuation cursor, and token estimate.
- Index diagnostics or stale data that could change the answer.

The response should use concise structured data plus compact agent-readable text.
It should not require the agent to parse a visualization format or infer edge
direction from prose.

## Agent Workflows the Query Set Must Support

### Understand a Feature

Resolve an entry point, trace its full-stack Routes, inspect key symbols, then
request linked design documentation only if needed.

### Implement a Change

Resolve the edit target, inspect usages and impact, build a Context Pack, edit,
then query changed entities and nearest tests.

### Diagnose a Failure

Seed from an exception symbol, stack frame, endpoint, failing test, or database
object; inspect callers and data Routes; retrieve runbooks through the separate
documentation query when appropriate.

### Refactor Safely

Query exact references, dispatch relationships, contract boundaries, impact, and
tests. After the edit, compare Atlas generations for removed or redirected
relations.

### Review a Change

Map the diff to entities, compare Routes and contracts, inspect newly ambiguous
or unresolved relations, and identify stale documentation separately.

### Modify a Database Feature

Trace endpoint-to-database use, inspect mappings and migrations, find all readers
and writers, identify affected frontend contracts, then retrieve database design
documents through `get_documentation_for_entity`.

## What an Agent Does Not Want

- A full repository graph for a local question.
- Unbounded neighbor lists dominated by utility symbols.
- Documentation mentions mixed into code references.
- Silent selection of an overload, basename, route, or database object.
- Entire files when one symbol body or signature is sufficient.
- Stale source slices without a freshness warning.
- Duplicate facts from multiple analyzers with no canonical merge.
- A natural-language answer with no exact entities or evidence.
- Tool surfaces that implement different ranking and query semantics.
