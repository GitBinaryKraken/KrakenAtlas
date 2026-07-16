import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  AssessmentQueryResult,
  AtlasEntitySearchResult,
  BuildAtlasResult,
  ChangeSurfaceResult,
  DecorateNodesResult,
  PreparedChangeResult,
  RelationQueryResult,
  RouteQueryResult
} from "../src/atlas/contracts";

test("maps a complete .NET feature route across DI, HTTP, API, logic, Dapper, and PostgreSQL", () => {
  const assembly = path.resolve(
    process.cwd(),
    "cartographer",
    "KrakenAtlas.Cartographer",
    "bin",
    "Release",
    "net10.0",
    "KrakenAtlas.Cartographer.dll"
  );
  const fixtureRoot = path.resolve(process.cwd(), "test-fixtures", "dotnet-feature-flow");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kraken-atlas-feature-route-"));
  const workspaceRoot = path.join(temporaryRoot, "workspace");
  const atlasPath = path.join(temporaryRoot, "atlas.sqlite3");
  const invoke = <T>(command: string, ...extra: string[]): T => JSON.parse(execFileSync("dotnet", [
    assembly,
    command,
    "--workspace",
    workspaceRoot,
    "--atlas",
    atlasPath,
    ...extra
  ], { encoding: "utf8" })) as T;
  const findEntity = (query: string, kind: string, qualifiedName: string) => {
    const result = invoke<AtlasEntitySearchResult>(
      "search", "--query", query, "--kind", kind, "--limit", "50"
    );
    const match = result.matches.find(candidate => candidate.qualifiedName === qualifiedName);
    assert.ok(match, `Expected ${kind} ${qualifiedName}`);
    return match;
  };

  try {
    fs.cpSync(fixtureRoot, workspaceRoot, {
      recursive: true,
      filter: source => !source.split(path.sep).some(part => part === "bin" || part === "obj")
    });
    execFileSync("dotnet", ["restore", path.join(workspaceRoot, "FeatureFlow.slnx")], {
      encoding: "utf8"
    });
    const build = invoke<BuildAtlasResult>("build");
    assert.equal(build.generation, 1);
    assert.equal(build.counts.solutions, 1);
    assert.equal(build.counts.projects, 7);

    const source = findEntity(
      "PersonaController.Index",
      "method",
      "FeatureFlow.WebUI.PersonaController.Index(string, System.Threading.CancellationToken)"
    );
    const connectorContract = findEntity(
      "IPersonaConnector.GetPublicPersonaAsync",
      "method",
      "FeatureFlow.Connector.IPersonaConnector.GetPublicPersonaAsync(string, System.Threading.CancellationToken)"
    );
    const endpoint = findEntity("GET /Persona", "http_endpoint", "GET /Persona");
    const request = findEntity("GET /Persona?url", "http_request", "GET /Persona?url={sid}");
    const databaseObject = findEntity("public.personas", "database_object", "public.personas");
    const registration = findEntity(
      "IPersonaService",
      "service_registration",
      "FeatureFlow.Logic.IPersonaService -> FeatureFlow.Logic.PersonaService"
    );
    const logicMethod = findEntity(
      "FeatureFlow.Logic.PersonaService.GetPublicPersonaAsync",
      "method",
      "FeatureFlow.Logic.PersonaService.GetPublicPersonaAsync(string, System.Threading.CancellationToken)"
    );
    const testCase = findEntity(
      "GetPublicPersona_returns_record",
      "test_case",
      "FeatureFlow.Tests.PersonaServiceTests.GetPublicPersona_returns_record()"
    );
    assert.equal(endpoint.signature, "GET /Persona | anonymous");
    assert.match(registration.signature ?? "", /^scoped /);
    assert.equal(databaseObject.firstLocation?.relativePath, "DataAccess/PersonaData.cs");
    assert.match(testCase.signature ?? "", /^xunit test /);

    const endpointRelations = invoke<RelationQueryResult>(
      "relations",
      "--stable-key",
      endpoint.stableKey,
      "--direction",
      "both",
      "--limit",
      "20"
    );
    assert.ok(endpointRelations.relations.some(relation =>
      relation.kind === "handled_by" && relation.target.qualifiedName.startsWith("FeatureFlow.Api.PersonaController.Get")));
    assert.ok(endpointRelations.relations.some(relation =>
      relation.kind === "matches_endpoint" && relation.source.stableKey === request.stableKey));

    const route = invoke<RouteQueryResult>(
      "route",
      "--source-key",
      source.stableKey,
      "--via-key",
      connectorContract.stableKey,
      "--target-key",
      databaseObject.stableKey,
      "--max-depth",
      "16",
      "--max-visited",
      "5000"
    );
    assert.equal(route.found, true);
    assert.equal(route.graphTruncated, false);
    assert.deepEqual(route.waypoints.map(waypoint => waypoint.stableKey), [connectorContract.stableKey]);
    assert.deepEqual(route.steps.map(step => step.relation.kind), [
      "calls",
      "dispatches_to",
      "sends_http",
      "matches_endpoint",
      "handled_by",
      "calls",
      "dispatches_to",
      "calls",
      "dispatches_to",
      "executes_sql",
      "reads"
    ]);
    assert.deepEqual(route.steps.map(step => step.relation.domain), [
      "code",
      "framework",
      "framework",
      "framework",
      "framework",
      "code",
      "framework",
      "code",
      "framework",
      "database",
      "database"
    ]);
    assert.ok(route.steps.every(step => step.relation.kind !== "contains"));
    assert.ok(route.steps.every(step => !step.relation.evidence.relativePath.endsWith("README.md")));

    const bounded = invoke<RouteQueryResult>(
      "route",
      "--source-key",
      source.stableKey,
      "--target-key",
      databaseObject.stableKey,
      "--max-depth",
      "5",
      "--max-visited",
      "100"
    );
    assert.equal(bounded.found, false);
    assert.deepEqual(bounded.steps, []);

    const surface = invoke<ChangeSurfaceResult>(
      "surface",
      "--stable-key",
      logicMethod.stableKey,
      "--max-depth",
      "2",
      "--max-entities",
      "100"
    );
    assert.equal(surface.atlasState, "current");
    assert.equal(surface.seedProject?.relativePath, "Logic/Logic.csproj");
    assert.equal(surface.truncated, false);
    assert.equal(surface.graphTruncated, false);
    assert.ok(surface.direct.some(item =>
      item.pathDirection === "dependent"
      && item.entity.qualifiedName === "FeatureFlow.Tests.PersonaServiceTests.GetPublicPersona_returns_record()"));
    assert.ok(surface.direct.some(item =>
      item.pathDirection === "dependency"
      && item.entity.qualifiedName.startsWith("FeatureFlow.DataAccess.IPersonaData.GetPublicPersonaAsync")));
    assert.deepEqual(surface.relatedTests.map(item => item.entity.stableKey), [testCase.stableKey]);
    assert.ok(surface.affectedProjects.some(project =>
      project.relativePath === "Tests/Tests.csproj" && project.isTest));
    assert.ok(surface.verificationCommands.some(command =>
      command.kind === "test" && command.commandText === "dotnet test \"Tests/Tests.csproj\""));

    const decorationPath = path.join(temporaryRoot, "persona-assessments.json");
    fs.writeFileSync(decorationPath, JSON.stringify({
      $schema: "https://raw.githubusercontent.com/GitBinaryKraken/KrakenAtlas/main/docs/planning/contracts/node-decoration-batch.schema.json",
      schemaVersion: "1.0",
      operationId: "feature-flow-persona-assessments",
      workspace: {
        workspaceKey: build.workspaceKey,
        expectedAtlasGeneration: build.generation
      },
      session: {
        agent: { name: "integration-test", model: "deterministic", client: "node-test" },
        purpose: "Record reusable Persona feature knowledge."
      },
      options: {
        atomic: true,
        dryRun: false,
        completeSession: true,
        conflictPolicy: "record",
        missingSubjectPolicy: "reject"
      },
      decorations: [{
        clientUpdateId: "classify-persona-service",
        subject: {
          stableKey: logicMethod.stableKey,
          expectedKind: "method",
          expectedQualifiedName: logicMethod.qualifiedName
        },
        update: {
          kind: "classify_role",
          role: "application_service",
          layer: "application",
          responsibility: "Coordinates the public Persona read."
        },
        statement: "This method is the application-service boundary for the public Persona read.",
        confidence: 0.96,
        requestedStatus: "accepted",
        dependencyPolicy: "capture_from_evidence",
        evidence: [{
          kind: "source_location",
          path: "Logic/PersonaService.cs",
          startLine: 13,
          endLine: 14,
          note: "The implementation delegates to the data boundary."
        }],
        tags: ["persona", "application-service"]
      }, {
        clientUpdateId: "join-persona-read-feature",
        subject: { stableKey: logicMethod.stableKey, expectedKind: "method" },
        update: {
          kind: "add_membership",
          group: {
            kind: "feature",
            key: "feature:persona-public-read",
            name: "Persona Public Read",
            definition: "The web-to-PostgreSQL public Persona read path."
          },
          participantRole: "application_service",
          strength: "core",
          ordinal: 6
        },
        statement: "This method is the application-service participant in the Persona public-read feature.",
        confidence: 0.94,
        requestedStatus: "accepted",
        dependencyPolicy: "capture_from_evidence",
        evidence: [{
          kind: "source_location",
          path: "Logic/PersonaService.cs",
          startLine: 13,
          endLine: 14
        }],
        tags: ["persona", "feature-membership"]
      }]
    }, null, 2));

    const dryRun = invoke<DecorateNodesResult>("decorate-nodes", "--input", decorationPath, "--dry-run");
    assert.equal(dryRun.status, "validated");
    assert.equal(dryRun.results.length, 2);
    const applied = invoke<DecorateNodesResult>("decorate-nodes", "--input", decorationPath);
    assert.equal(applied.status, "applied");
    assert.ok(applied.results.every(item => item.status === "accepted"));
    assert.ok(applied.results.every(item => item.dependencyCount >= 2));
    const replayed = invoke<DecorateNodesResult>("decorate-nodes", "--input", decorationPath);
    assert.equal(replayed.status, "replayed");
    assert.deepEqual(replayed.results.map(item => item.claimIds), applied.results.map(item => item.claimIds));

    const assessments = invoke<AssessmentQueryResult>(
      "assessments", "--stable-key", logicMethod.stableKey
    );
    assert.equal(assessments.assessments.length, 2);
    assert.ok(assessments.assessments.every(item => item.freshness === "current"));
    assert.deepEqual(
      assessments.assessments.map(item => item.updateKind).sort(),
      ["add_membership", "classify_role"]
    );

    const prepared = invoke<PreparedChangeResult>(
      "prepare",
      "--stable-key",
      logicMethod.stableKey,
      "--task",
      "Add audit logging to the public Persona read",
      "--token-budget",
      "4000"
    );
    assert.equal(prepared.atlasState, "current");
    assert.ok(prepared.estimatedTokens <= prepared.tokenBudget);
    assert.equal(prepared.items[0].relevance, "seed");
    assert.ok(prepared.items.some(item => item.relevance === "related_test"));
    assert.deepEqual(
      prepared.assessments.map(item => item.updateKind).sort(),
      ["add_membership", "classify_role"]
    );
    assert.ok(prepared.verificationCommands.some(command => command.kind === "test"));

    fs.appendFileSync(path.join(workspaceRoot, "Logic", "PersonaService.cs"), "\n// Staleness fixture change.\n");
    const rebuilt = invoke<BuildAtlasResult>("build");
    assert.equal(rebuilt.generation, 2);
    const currentOnly = invoke<AssessmentQueryResult>(
      "assessments", "--stable-key", logicMethod.stableKey
    );
    assert.deepEqual(currentOnly.assessments, []);
    const stale = invoke<AssessmentQueryResult>(
      "assessments", "--stable-key", logicMethod.stableKey, "--include-stale"
    );
    assert.equal(stale.assessments.length, 2);
    assert.ok(stale.assessments.every(item => item.freshness === "stale"));
    assert.ok(stale.assessments.every(item => item.staleReasons.length >= 1));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
