import { strict as assert } from "node:assert";
import test from "node:test";
import { createDiagnosticReport } from "../src/diagnostics/report";

test("diagnostic reports include operational metadata without project or source contents", () => {
  const report = createDiagnosticReport({
    generatedUtc: "2026-07-15T20:00:00.000Z",
    extensionVersion: "0.3.2",
    vscodeVersion: "1.128.1",
    vscodeAppName: "Visual Studio Code",
    platform: "win32",
    architecture: "x64",
    osRelease: "test-release",
    workspaceRoots: ["E:\\Projects\\SecretWorkspace"],
    atlasPath: "C:\\Storage\\atlas.sqlite3",
    runtime: {
      command: "dotnet --list-runtimes",
      requiredRuntime: "Microsoft.NETCore.App 10.x",
      available: true,
      installedCoreRuntimeVersions: ["10.0.4"]
    },
    session: {
      protocolVersion: "1.0",
      serviceVersion: "0.3.2",
      capabilities: ["atlas.build"]
    },
    foundation: {
      phase: "walking_cartographer",
      cartographerState: "available",
      atlasState: "current",
      indexingState: "current",
      message: "Atlas is current."
    },
    summary: {
      atlasState: "current",
      generation: 3,
      workspaceKey: "workspace:test",
      workspaceName: "SecretWorkspace",
      roots: ["E:\\Projects\\SecretWorkspace"],
      counts: {
        solutions: 2,
        projects: 8,
        files: 672,
        entities: 683,
        relations: 692,
        projectDependencies: 10
      },
      projects: [{
        id: 1,
        stableKey: "project:secret",
        name: "DoNotIncludeProjectName",
        relativePath: "src/DoNotInclude.csproj",
        language: "csharp",
        projectKind: "application",
        dependencyCount: 0
      }],
      analyzerRuns: [{
        analyzer: "workspace-discovery",
        analyzerVersion: "0.9.5",
        capability: "workspace.structure",
        status: "complete",
        durationMs: 139
      }]
    },
    health: {
      atlasState: "current",
      generation: 3,
      buildRequired: false,
      sourceState: "current",
      workspaceRoots: ["E:\\Projects\\SecretWorkspace"],
      analyzers: [{
        analyzer: "roslyn",
        expectedVersion: "0.9.5",
        indexedVersions: ["0.9.5"],
        current: true
      }],
      git: {
        status: "no_repository",
        repositoryRoots: [],
        guidance: "Skip project_git_changes until a workspace root is inside a Git repository."
      },
      connection: {
        mode: "path_bound_stdio",
        pathBound: true,
        refreshBehavior: "Managed entries refresh on trusted extension activation."
      },
      coverage: {
        status: "partial",
        includedSources: ["MSBuild project files"],
        pendingSources: ["CI workflows"]
      },
      reasons: [{ code: "coverage_partial", message: "Coverage is partial." }],
      recommendedActions: ["Use prepare_change only for concrete coding changes."]
    },
    agentConnection: {
      state: "connected_current",
      message: "Codex verified Kraken Atlas through get_atlas_health.",
      clients: [],
      setupPending: false,
      recommendations: []
    }
  });

  const json = JSON.stringify(report);
  assert.equal(report.atlas.counts.projects, 8);
  assert.equal(report.atlas.analyzerRuns[0].durationMs, 139);
  assert.equal(report.atlas.health?.git.status, "no_repository");
  assert.equal(report.atlas.health?.buildRequired, false);
  assert.equal(report.agentConnection?.state, "connected_current");
  assert.equal(report.privacy.containsSourceBodies, false);
  assert.equal(report.privacy.telemetrySentByKrakenAtlas, false);
  assert.match(json, /SecretWorkspace/);
  assert.doesNotMatch(json, /DoNotIncludeProjectName/);
  assert.doesNotMatch(json, /DoNotInclude\.csproj/);
  assert.doesNotMatch(json, /projects":\[/);
});
