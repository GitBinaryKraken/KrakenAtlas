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
9. Canonical and deterministic facts are never overwritten by agent assessments
   or manual annotations.
10. Every reusable assessment records a typed claim, evidence, dependencies,
    provenance, scope, and freshness.
11. Changed dependencies mark assessments stale rather than silently carrying
    conclusions into a new generation.

## Logical SQLite Schema

### Workspace and Index State

- `workspaces`: normalized workspace identity and roots.
- `projects`: language, project kind, target framework, configuration, and
  project identity.
- `project_facets`: one project may be an application, library, test, web host,
  worker, migration project, database project, frontend, tool, or generator,
  with evidence and applicable conditions for each facet.
- `project_dependencies`: project and package dependency edges.
- `workspace_commands`: build, test, run, format, generate, package, and migrate
  commands with working directory, target scope, conditions, source, and
  precedence.
- `repository_rules`: structured conventions and instruction references with
  category, scope, authority, precedence, source, and generation.
- `build_dimensions`: target frameworks, configurations, platforms, runtime
  identifiers, compilation constants, and feature conditions.
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
- `analysis_sessions`: bounded agent or tool analysis passes tied to an exact
  Atlas generation and input fingerprints.
- `assessment_claims`: typed, schema-versioned agent or manual conclusions with
  status, scope, confidence, and validated generation.
- `assessment_updates`: idempotent typed update intents submitted by an agent,
  including the exact versioned payload kind and resulting claims or projections.
- `assessment_evidence`: entity, relation, source-location, Route, and document
  evidence supporting a claim.
- `assessment_dependencies`: generation, file-hash, document-fingerprint, and
  algorithm dependencies used to invalidate stale claims.
- `feature_memberships`, `pattern_instances`, `entity_effects`,
  `lifecycle_facets`, `change_surface_snapshots`, and `change_surface_items`:
  typed node-knowledge dimensions and materialized projections.
- `assessment_groups` and `assessment_group_memberships`: agent-authored feature,
  pattern, Blueprint, workflow, boundary, capability, or concern nodes and their
  role-bearing membership edges.

Common fields are typed columns. Analyzer-specific extension data may use
versioned JSON, but JSON must not replace the canonical relation model.

## Entity Kinds

### Workspace and Code

`workspace`, `solution`, `project`, `package`, `namespace`, `file`, `type`,
`method`, `constructor`, `property`, `field`, `event`, `parameter`, `local`, and
`external_symbol`.

### Workspace Orientation

`project_facet`, `framework`, `target_framework`, `build_configuration`,
`runtime_identifier`, `build_command`, `test_command`, `run_command`,
`format_command`, `generation_command`, `package_command`, `migration_command`,
`repository_rule`, `convention`, `build_target`, and `entry_point`.

Project role is multi-valued. For example, a project can be both an application
and an ASP.NET Core host, or both a tool and a migration runner. It must not be
forced into one lossy `project_kind` value.

### Assessment-Owned Grouping Nodes

`assessed_feature`, `assessed_pattern`, `assessed_blueprint`,
`assessed_subsystem`, `assessed_bounded_context`, `assessed_workflow`,
`assessed_boundary`, `assessed_business_capability`, and `assessed_concern`.

These nodes organize canonical entities but are never represented as compiler or
configuration truth. Their keys, definitions, memberships, participant roles,
evidence, confidence, status, and freshness come from the assessment ledger.

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

### Workspace Orientation

`has_facet`, `targets`, `builds`, `tests`, `runs`, `formats`, `generates`,
`packages`, `governs`, `applies_to`, `takes_precedence_over`, `hosts`, and
`enters_at`.

Command relations identify the projects, solutions, or workspace they operate
on. Rule and convention relations identify scope and precedence. Host and entry
relations distinguish executable composition from ordinary project containment.

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
- `get_workspace_orientation(scope?, configuration?, include_commands?, include_conventions?)`
- `get_entity_context(entity, dimensions?, configuration?, assessment_policy?, budget?)`
- `get_entity_facts(entity, dimensions?, configuration?, evidence?)`
- `get_entity_assessments(entity, dimensions?, freshness?, status?, limit?)`
- `get_feature_context(feature, dimensions?, configuration?, assessment_policy?, budget?)`
- `get_assessed_group(group_key, include_members?, include_routes?, freshness?)`
- `get_knowledge_gaps(scope?, kinds?, blocks_reuse?, freshness?, limit?)`
- `decorate_nodes(payload)` using the versioned node-decoration batch schema
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

Assessment writes follow the strict contract in
[Node Decoration Command](NODE_DECORATION_COMMAND.md). They are generation-pinned,
idempotent, evidence-backed, and transactional; they never mutate canonical
analyzer facts.
