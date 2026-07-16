# Kelp Field Benchmark

The Kelp projects are Kraken Atlas's first representative field benchmark. They
exercise a large, disconnected .NET workspace with real cross-project behavior,
hand-written HTTP clients, shared contracts, hosted work, Dapper, PostgreSQL,
EF Core, and several similarly named symbols.

The workspace currently lives at `E:\Projects2026\CodeKraken\test-projects`.
It is an opt-in local benchmark, not a redistributable deterministic fixture.
No Kelp source or generated Atlas is copied into the extension.

## Ground-Truth Project Roles

| Project | Expected roles | Direct project dependencies |
| --- | --- | --- |
| `Kelp2025_WebUI` | ASP.NET Core UI host, application, database/migration owner | `KelpApiConnector`, `KelpApiDomain` |
| `KelpApi` | ASP.NET Core API host, application, background-worker host, database client | `KelpApiDomain`, `KelpApiLogicLayer`, `KelpPostGresData` |
| `KelpApiConnector` | HTTP API client/adapter library | `KelpApiDomain` |
| `KelpApiDomain` | Shared API contract and view-model library | none |
| `KelpApiLogicLayer` | Business/domain service library | `KelpApiDomain`, `KelpPostGresDomain` |
| `KelpPostGresData` | PostgreSQL data-access library | `KelpApiLogicLayer`, `KelpPostGresDomain` |
| `KelpPostGresDomain` | Database model library | none |

`KelpApiConnector` is the boundary between the WebUI and API. Its service
interfaces are consumed by WebUI controllers and components. Its implementations
construct HTTP requests, forward selected request context, and deserialize
`KelpApiDomain` contracts.

## Structural Baseline

On 2026-07-15, before semantic analyzers, Cartographer indexed the complete local
test workspace in 156 ms:

- 2 solutions and 11 projects, including 8 .NET and 3 TypeScript/React projects.
- 672 files, 798 entities, 807 relations, and 10 project dependencies.
- 31 derived commands across build, test, run, format, package, and migration.

The baseline proves workspace-wide project discovery is required because there is
no single solution that owns every Kelp project. It also verifies the Phase 1
classification fixes for database evidence from Dapper/Npgsql/SqlClient packages
and hosted workers registered inside an ASP.NET Core host. Automatic recognition
of `KelpApiConnector` as an HTTP client/adapter remains framework-analyzer work.

## C# Declaration Baseline

On 2026-07-15, the first Roslyn declaration slice indexed the same workspace in
21.6 seconds with analyzer status `succeeded`:

- 5,269 compiler-bound C# declarations.
- 6,067 total Atlas entities and 6,076 relations.
- Exact separation of the two `PersonaController` classes, two
  `IPersonaService` interfaces, two `PersonaService` implementations, and six
  `GetPublicPersona`/`GetPublicPersonaAsync` declarations.

This is the cold full-build declaration baseline.

## C# Relationship Baseline

On 2026-07-15, the first compiler-bound relationship slice indexed the same
workspace in 43.6 seconds with analyzer status `succeeded`:

- 6,067 total Atlas entities and 14,216 relations in a 6.2 MiB SQLite Atlas.
- Roslyn completed in 40.0 seconds; workspace discovery and orientation completed
  in 2.7 seconds.
- The WebUI `PersonaController.Index` call resolved exactly to connector
  `IPersonaService.GetPublicPersonaAsync`, and the concrete connector method was
  linked with `implements_member`.
- API `PersonaController.Get` resolved exactly to logic
  `IPersonaService.GetPublicPersona`, and logic `PersonaService.GetPublicPersona`
  resolved exactly to `IPersonaDataService.GetPublicPersona`.
- `KelpPostGresData.Services.PersonaDataService.GetPublicPersona` was linked as
  the concrete data-service implementation. All three interface calls carry
  `interface` dispatch and exact source spans.

That relationship baseline did not interpret effective HTTP routes, DI
registrations, SQL text, or database objects. The Persona Route baseline below
adds those facts as separate framework and database claims.

## Persona Route Baseline

On 2026-07-15, the Persona Route Alpha indexed the same workspace in 33.4
seconds:

- 6,594 total Atlas entities and 16,190 relations.
- Exact scoped DI dispatch for the WebUI connector, API logic service, and API
  data service registrations.
- Effective anonymous endpoint `GET /Persona` and outbound request template
  `GET /Persona?url={sid}`, connected by `matches_endpoint`.
- Canonical PostgreSQL object `public.personas` and the Dapper read operation
  that reaches it.
- An evidence-backed 11-hop Route from
  `Kelp2025_WebUI.Controllers.PersonaController.Index` through the public
  connector interface, HTTP boundary, API, logic, and data layers to
  `public.personas`.
- The public connector interface method is supplied as an ordered waypoint so
  the query does not select the equally valid owned-Persona authorization branch
  that reaches the same table.

The Route returned 11 steps, visited 99 entities, did not truncate the loaded
graph, and carried exact source evidence on every relation.

## Change Surface Baseline

On 2026-07-15, a default depth-3 change surface for
`KelpApiLogicLayer.Services.PersonaService.GetPublicPersona` returned:

- 5 direct and 9 transitive entities.
- The API caller, anonymous `GET /Persona` endpoint, data-service
  implementation, and PostgreSQL read operation.
- 4 affected projects: `KelpApi`, `KelpApiLogicLayer`, `KelpPostGresData`, and
  `KelpPostGresDomain`.
- No graph or entity truncation.
- No related tests because the indexed Kelp workspace contains no discovered
  test project for this feature.

An unrestricted prototype reached the 200-entity cap through shared model
member reads/writes and type-use relations. The accepted default profile keeps
those high-fanout code relations when directly attached to the seed but does not
recursively expand through them. Explicit relation-kind filters remain available
for intentional member/type impact exploration.

## Agent Memory Baseline

On 2026-07-15, version 0.7 prepared a change for
`KelpApiLogicLayer.Services.PersonaService.GetPublicPersona` with the task
"Add auditable access logging to the public Persona read" and a 4,000-token
budget. A fresh CLI process returned in 309 ms, including process startup:

- 3,288 estimated tokens within the requested 4,000-token budget.
- 9 ranked context items: the seed, all 5 direct items, and 3 transitive items.
- The same 4 affected API, logic, data, and database-domain projects.
- 4 focused verification commands.
- 6 lower-ranked items explicitly omitted by budget.
- No surface or relation-graph truncation.
- No reusable assessments because the temporary benchmark Atlas had not been
  decorated. The deterministic fixture separately proves accepted-assessment
  inclusion and dependency-based staleness.

The full Kelp index for this run remained 11 projects, 672 files, 6,594 entities,
and 16,190 relations and completed in 34.5 seconds.

## Framework Surface Baseline

On 2026-07-15, version 0.7.5 indexed the same 11-project, 672-file workspace in
31.7 seconds and produced 6,738 entities and 16,763 relations. The added static
framework surface correctly recovered:

- `Kelp2025_WebUI.Data.ApplicationDbContext` with three source-declared mapped
  sets and `KelpApi.Data.DataProtectionKeyContext` with its source-visible set.
- `AdminTools.Data.AdminIdentityDbContext` even though it declares no local
  `DbSet`, preserving the context as an architectural database boundary.
- Callback-style fluent mappings for `public.personas` and
  `public.account_settings` in `ApplicationDbContext.OnModelCreating`.
- One unified `public.personas` database object carrying both Dapper/PostgreSQL
  and EF Core evidence instead of duplicate physical-table nodes.
- The grouped AdminTools Minimal API route `GET /admin-bridge/health` with its
  effective static `MapGroup` prefix.
- Source-ordered custom and built-in middleware in the Kelp API and WebUI hosts.

This baseline does not claim complete Identity model reconstruction, generated
string-based model-snapshot interpretation, relationship/owned-entity semantics,
or runtime middleware and endpoint-filter composition.

## Gold Persona Route

The initial semantic and full-stack acceptance Route is the public Persona read:

1. `Kelp2025_WebUI.Controllers.PersonaController.Index` calls connector
   `IPersonaService.GetPublicPersonaAsync` when an editable owned Persona is not
   selected.
2. WebUI composition in `Kelp2025_WebUI/Program.cs` binds that interface to
   `KelpApiConnector.Services.Personas.PersonaService` with a scoped lifetime.
3. The connector sends `GET {Api:BaseUrl}/Persona?url={sid}`, forwards cookies,
   and deserializes `PersonaViewModel`.
4. `KelpApi.Controllers.PersonaController.Get` is the anonymous API action for
   `[Route("[controller]")]` plus `[HttpGet]`.
5. API composition binds `KelpApiLogicLayer.ServiceDefinitions.IPersonaService`
   to `KelpApiLogicLayer.Services.PersonaService`.
6. The logic method calls `IPersonaDataService.GetPublicPersona` and maps the
   returned `PersonaDataModel` to the shared API view model.
7. API composition binds `IPersonaDataService` to
   `KelpPostGresData.Services.PersonaDataService` using the default connection
   string.
8. The Dapper method opens an `NpgsqlConnection` and reads
   `public.personas` with `sid = @PersonaSid` and `is_enabled = true`.

Every hop must carry source evidence, analyzer provenance, and fidelity. The
Route must distinguish the two `PersonaController`, `IPersonaService`, and
`PersonaService` declarations by exact symbol identity rather than basename.

## Required Queries

- Workspace orientation must return every project role, dependency, target
  framework, hosted worker, database boundary, and supported command.
- Code usage must resolve each interface call, implementation, constructor
  injection, mapping extension, and returned contract without documentation
  results.
- Framework queries must return effective HTTP routes, methods, authorization,
  DI lifetimes, request/response contracts, and hosted-service registration.
- Route queries must traverse WebUI to connector to API to logic to data to the
  exact database object, with bounded alternatives where static resolution is
  ambiguous.
- Database queries must return `public.personas`, operation kind `read`, selected
  columns, parameter binding, provider `PostgreSQL`, and the owning method.
- Impact queries for `PersonaViewModel`, the public endpoint, or
  `public.personas` must return the relevant cross-project change surface.
- Documentation queries remain separate and may link related sections only when
  explicitly requested.
- An 8,000-token Context Pack for the public Persona flow must include the gold
  symbols and evidence without requiring unrestricted repository reads.

## Expansion Routes

After the public Persona read passes, add gold Routes for:

- Owned Persona editing, including cookie forwarding, authentication,
  authorization, and the public/owned SQL behavior difference.
- Location and Page workflows, which exercise larger service and SQL surfaces.
- Image processing, which exercises hosted-service lifecycle, queues, external
  HTTP effects, and database updates.
- One React fixture to API route and one deliberately ambiguous dynamic URL.

## Release Use

This benchmark is a release gate, not a CI dependency. Deterministic regressions
belong in small owned fixtures. Before a semantic alpha is promoted, run the Kelp
workspace, record index time, Atlas size, diagnostics, query latency, Route
coverage, Context Pack recall, and unnecessary source tokens, then compare the
result with the prior release.

The PostgreSQL-heavy benchmark remains direct evidence for the provider-specific
SQL work still required during Phase 3.
