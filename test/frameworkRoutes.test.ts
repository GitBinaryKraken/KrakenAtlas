import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  AtlasEntitySearchResult,
  BuildAtlasResult,
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
    assert.equal(build.counts.projects, 6);

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
    assert.equal(endpoint.signature, "GET /Persona | anonymous");
    assert.match(registration.signature ?? "", /^scoped /);
    assert.equal(databaseObject.firstLocation?.relativePath, "DataAccess/PersonaData.cs");

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
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
