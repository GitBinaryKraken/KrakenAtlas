import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  AtlasEntitySearchResult,
  AtlasHealthResult,
  BuildAtlasResult,
  EntityDetail,
  WorkspaceOrientation
} from "../src/atlas/contracts";

test("workspace orientation maps mixed project roles, commands, dimensions, and governing rules", () => {
  const assembly = path.resolve(
    process.cwd(),
    "cartographer",
    "KrakenAtlas.Cartographer",
    "bin",
    "Release",
    "net10.0",
    "KrakenAtlas.Cartographer.dll"
  );
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kraken-atlas-orientation-"));
  const atlasPath = path.join(temporaryRoot, "atlas.sqlite3");
  const workspaceRoot = path.join(temporaryRoot, "workspace");
  const fixtureRoot = path.resolve(process.cwd(), "test-fixtures", "workspace-orientation");

  const invoke = (command: string, ...extra: string[]) => JSON.parse(execFileSync("dotnet", [
    assembly,
    command,
    "--workspace",
    workspaceRoot,
    "--atlas",
    atlasPath,
    ...extra
  ], { encoding: "utf8" }));

  try {
    fs.cpSync(fixtureRoot, workspaceRoot, { recursive: true });
    const initialHealth = invoke("health") as AtlasHealthResult;
    assert.equal(initialHealth.atlasState, "not_created");
    assert.equal(initialHealth.buildRequired, true);
    assert.equal(initialHealth.git.status, "no_repository");
    assert.match(initialHealth.git.guidance, /Skip project_git_changes/);
    assert.ok(initialHealth.coverage.pendingSources.includes("ci_workflows"));

    const build = invoke("build") as BuildAtlasResult;
    assert.equal(build.counts.projects, 5);
    assert.equal(build.counts.files, 17);

    const health = invoke("health") as AtlasHealthResult;
    assert.equal(health.atlasState, "current");
    assert.equal(health.buildRequired, false);
    assert.equal(health.sourceState, "current");
    assert.equal(health.git.status, "no_repository");
    assert.ok(health.analyzers.every(analyzer => analyzer.current));
    assert.ok(health.recommendedActions.some(action =>
      action.includes("install or workspace-health review")));

    const hostedService = invoke(
      "search",
      "--query",
      "Web AddHostedService CacheRefreshWorker",
      "--kind",
      "service_registration",
      "--limit",
      "10"
    ) as AtlasEntitySearchResult;
    assert.ok(hostedService.matches.some(match =>
      match.name === "AddHostedService<CacheRefreshWorker>"
      && match.projectName === "Web"
      && match.firstLocation?.relativePath === "apps/Web/Program.cs"));

    const orientation = invoke("orientation") as WorkspaceOrientation;
    assert.equal(orientation.atlasState, "current");
    assert.equal(orientation.coverage.status, "partial");
    assert.ok(orientation.coverage.includedSources.includes("package_scripts"));
    assert.ok(orientation.coverage.includedSources.includes("hosted_service_registrations"));
    assert.ok(orientation.coverage.pendingSources.includes("ci_workflows"));
    assert.equal(orientation.projects.length, 5);

    const web = orientation.projects.find(project => project.name === "Web");
    assert.ok(web);
    assert.deepEqual(web.facets.map(facet => facet.facet), ["application", "aspnet_core_host", "worker"]);
    const hostedWorker = web.facets.find(facet => facet.facet === "worker");
    assert.equal(hostedWorker?.evidence.relativePath, "apps/Web/Program.cs");
    assert.equal(hostedWorker?.evidence.provenance, "source_marker");
    assert.deepEqual(
      web.buildDimensions
        .filter(dimension => dimension.kind === "target_framework")
        .map(dimension => dimension.value),
      ["net10.0", "net9.0"]
    );
    const staging = web.buildDimensions.find(dimension => dimension.value === "STAGING");
    assert.equal(staging?.evidence.condition, "'$(Configuration)' == 'Staging'");

    const migrations = orientation.projects.find(project => project.name === "Migrations");
    assert.ok(migrations?.facets.some(facet => facet.facet === "database"));
    assert.ok(migrations?.facets.some(facet => facet.facet === "migration"));
    assert.ok(orientation.commands.some(command =>
      command.kind === "migrate" && command.commandText.includes("dotnet ef database update")));

    const worker = orientation.projects.find(project => project.name === "Worker");
    assert.ok(worker?.facets.some(facet => facet.facet === "database"));

    const frontend = orientation.projects.find(project => project.name === "atlas-fixture-ui");
    assert.equal(frontend?.language, "typescript");
    assert.ok(frontend?.facets.some(facet => facet.facet === "frontend"));
    assert.ok(frontend?.buildDimensions.some(dimension =>
      dimension.kind === "framework" && dimension.value === "react"));
    assert.ok(orientation.commands.some(command => command.commandText === "npm run test"));

    assert.ok(orientation.workspaceBuildDimensions.some(dimension =>
      dimension.kind === "dotnet_sdk_version" && dimension.value === "10.0.100"));
    assert.equal(orientation.repositoryRules[0]?.category, "agent_instructions");
    assert.ok(orientation.repositoryRules.some(rule =>
      rule.name === "TreatWarningsAsErrors" && rule.value === "true"));
    assert.ok(orientation.repositoryRules.some(rule =>
      rule.name === "csharp_style_namespace_declarations" && rule.evidence.line === 5));

    const facet = web.facets.find(candidate => candidate.facet === "aspnet_core_host");
    assert.ok(facet);
    const entity = invoke("entity", "--stable-key", facet.stableKey) as EntityDetail;
    assert.equal(entity.kind, "project_facet");
    assert.equal(entity.name, "aspnet_core_host");
    assert.equal(entity.locations[0]?.relativePath, "apps/Web/Web.csproj");
    assert.equal(entity.incomingRelations, 1);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
