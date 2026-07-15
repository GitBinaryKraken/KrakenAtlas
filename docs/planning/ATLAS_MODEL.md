# Atlas Data and Query Model

## Invariants

1. An entity has one canonical numeric ID and one analyzer-owned stable key.
2. Display names and file paths are not sufficient identity.
3. Relationships are directed and typed.
4. Every non-derived relationship has at least one evidence record.
5. Derived facts retain the source facts and algorithm version that produced
   them.
6. Ambiguous and unresolved targets are stored, never silently rebound.
7. Atlas state is generation-based so queries never observe a half-written
   index.
8. Every relation has a domain; code usage and documentation relationships are
   queried independently.

## Logical SQLite Schema

### Workspace and Index State

- `workspaces`: normalized workspace identity and roots.
- `projects`: language, project kind, target framework, configuration, and
  project identity.
- `project_dependencies`: project and package dependency edges.
- `files`: normalized path, project, language, content hash, generated flag, and
  last successful generation.
- `analyzer_runs`: analyzer version, capability, timing, status, diagnostics, and
  generation.

### Canonical Facts

- `entities`: stable key, kind, name, qualified name, language, containing entity,
  signature, visibility, flags, and current generation.
- `entity_locations`: declaration, definition, generated, or metadata location
  with exact file range.
- `occurrences`: entity use at a file range with read, write, call, import,
  definition, or other role.
- `relations`: unique source, target, relation domain, relation kind, dispatch
  kind, and logical scope.
- `relation_evidence`: source range, analyzer, provenance, resolution state,
  confidence where applicable, and origin generation.
- `unresolved_targets`: analyzer key, spelling, expected kind, candidate set, and
  reason resolution was not exact.

### Derived Facts

- `entity_metrics`: fan-in, fan-out, PageRank, bridge score, entry-point score,
  and relation-specific metrics.
- `communities`: algorithm-versioned subsystem assignments.
- `blueprints`: saved projection definitions, not copied graph data.
- `entity_fts`: FTS5 index over names, qualified names, signatures,
  symbol documentation comments, paths, endpoint routes, and database names.
- `document_sections`: heading hierarchy, anchor, text range, document kind, and
  content fingerprint for addressable repository documentation.
- `document_fts`: a separate FTS5 index for document and section content.
- `file_relations` and `project_relations`: materialized aggregate projections
  derived from symbol-level evidence.

Common fields are typed columns. Analyzer-specific extension data may use
versioned JSON, but JSON must not replace the canonical relation model.

## Entity Kinds

### Workspace and Code

`workspace`, `solution`, `project`, `package`, `namespace`, `file`, `type`,
`method`, `constructor`, `property`, `field`, `event`, `parameter`, `local`, and
`external_symbol`.

### ASP.NET Core

`http_endpoint`, `middleware`, `service_registration`, `authorization_policy`,
`configuration_key`, `hosted_service`, and `request_contract` or
`response_contract` where a dedicated role is required.

### Database

`database`, `schema`, `table`, `view`, `column`, `primary_key`, `foreign_key`,
`unique_constraint`, `index`, `sequence`, `stored_procedure`, `database_function`,
`trigger`, `migration`, and `sql_statement`.

### TypeScript and React

Most TypeScript constructs use the canonical code kinds. React adds
`react_component`, `react_hook`, `react_context`, `client_route`, and
`http_request` when those concepts have evidence beyond an ordinary function or
call.

### Documentation

`document`, `document_section`, `adr`, `runbook`, `guide`, `api_document`,
`database_document`, `release_note`, and `diagram`.

## Relation Vocabulary

### Hierarchy and Code

`contains`, `declares`, `references`, `calls`, `constructs`, `inherits`,
`implements`, `overrides`, `uses_type`, `reads`, `writes`, `returns`, and
`accepts`.

### ASP.NET Core

`handles_http`, `uses_middleware`, `registers`, `resolves`, `binds_request`,
`returns_response`, and `requires_policy`.

### Database

`maps_to`, `has_column`, `primary_key_of`, `foreign_key_to`, `indexes`,
`reads_from`, `writes_to`, `executes`, `migrates`, and `configured_by`.

### React and Cross-Stack

`renders`, `uses_hook`, `provides_context`, `consumes_context`, `routes_to`, and
`requests_http`.

HTTP requests and endpoints remain separate entities. A resolved cross-stack
Route connects them with `requests_http`; evidence records the HTTP method,
normalized route template, original URL expression, and contract match quality.

### Documentation

`documents`, `explains`, `decides`, `specifies`, `runbook_for`, `example_for`,
`mentions`, and `supersedes`.

Documentation relations use the `documentation` domain. Code references, calls,
type uses, reads, and writes use the `code` domain. Query APIs never conflate the
two domains.

## Provenance and Resolution

`provenance` describes how a fact was produced:

- `compiler`: bound by Roslyn or the TypeScript checker.
- `framework`: derived from resolved framework APIs.
- `migration`: interpreted from a migration or model snapshot.
- `sql_parser`: extracted from parsed SQL.
- `scip`: imported from an official SCIP index.
- `syntax`: present in syntax but not semantically bound.
- `heuristic`: inferred from naming or incomplete evidence.
- `manual`: user-authored annotation.

`resolution` describes the target state:

- `exact`
- `overload_set`
- `dynamic_dispatch`
- `external`
- `ambiguous`
- `unresolved`

A confidence score is meaningful for heuristic facts. It must not blur the
difference between compiler truth and unresolved syntax.

## Product Projections

### Atlas

The complete canonical entity, relation, evidence, and metric set for the current
generation.

### Blueprint

A saved query definition containing seeds, project scope, entity filters,
relation filters, direction, depth, ranking policy, and result limit. It is
re-evaluated against the current Atlas.

### Routes

Directed path queries with separate profiles:

- `execution`: calls, construction, implementation, overrides, middleware, and
  endpoint handling.
- `dependency`: project references, imports, type use, and package dependencies.
- `http`: React request through ASP.NET Core endpoint and handler.
- `data`: method through EF/Dapper/ADO.NET operations to database objects.
- `full_stack`: client route through HTTP and application code to database.

Route profiles assign relation costs and limits. Containment edges are expensive
and cannot create a misleading shortcut through a common project or file.

### Landmarks

Derived rankings based on entry-point evidence, relation-specific fan-in,
betweenness or bridge behavior, project boundaries, and generated/external
penalties. A single high degree score is not sufficient.

### Context Pack

A budgeted response containing:

- Query intent and Atlas freshness.
- Selected entities with signatures and exact locations.
- The most explanatory Routes connecting the selected entities.
- Full bodies for the highest-value symbols and signatures or smaller slices for
  supporting symbols.
- Database and endpoint facts needed to understand the feature.
- Ambiguities, unresolved edges, stale projects, and omitted candidates.
- A concise inclusion reason for every item.

Context Pack requests include `documentation_policy=none|linked|search`.
Documentation selection runs independently and reports a separate token count.
The default for implementation and usage queries is `none`.

## Initial Query API

- `get_atlas_summary(project?, language?)`
- `search_symbols(query, kinds?, project?, limit?)`
- `get_symbol(stable_key_or_id, include_evidence?)`
- `find_usages(entity, usage_kinds?, scope?, direction?, include_tests?, limit?)`
- `get_neighbors(entity, relations?, direction?, depth?, limit?)`
- `trace_route(source, target?, profile, max_hops?, alternatives?)`
- `analyze_impact(entity, relations?, depth?, include_tests?)`
- `get_landmarks(scope?, kinds?, metric?, limit?)`
- `search_documentation(query, kinds?, project?, freshness?, limit?)`
- `get_documentation_for_entity(entity, relation_kinds?, document_kinds?, freshness?, limit?)`
- `get_code_for_documentation(document_or_section, relation_kinds?, limit?)`
- `get_documentation_health(scope?, include_broken?, include_stale?)`
- `build_context_pack(query, seed_entities?, profile?, token_budget?, documentation_policy?)`

VS Code tools, MCP tools, CLI commands, and UI views adapt these operations. They
must not implement separate retrieval behavior.
