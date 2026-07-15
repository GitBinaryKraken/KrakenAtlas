import { strict as assert } from "node:assert";
import test from "node:test";
import { renderAtlasSummary, renderEntityDetail, renderWorkspaceOrientation } from "../src/atlas/render";

test("renders a bounded project map from an Atlas summary", () => {
  const output = renderAtlasSummary({
    atlasState: "current",
    generation: 4,
    workspaceKey: "workspace:test",
    workspaceName: "sample",
    roots: ["/sample"],
    counts: {
      solutions: 1,
      projects: 2,
      files: 6,
      entities: 9,
      relations: 8,
      projectDependencies: 1
    },
    projects: [{
      id: 2,
      stableKey: "project:app",
      name: "App",
      relativePath: "src/App/App.csproj",
      language: "csharp",
      projectKind: "application",
      targetFrameworks: "net10.0",
      dependencyCount: 1
    }],
    analyzerRuns: []
  }, "0.3.0");

  assert.match(output, /Generation: 4/);
  assert.match(output, /Projects: 2/);
  assert.match(output, /src\/App\/App\.csproj \| application \| net10\.0/);
  assert.doesNotMatch(output, /workspace:test/);
});

test("renders exact entity identity and locations", () => {
  const output = renderEntityDetail({
    id: 12,
    stableKey: "project:app",
    kind: "project",
    name: "App",
    qualifiedName: "src/App/App.csproj",
    language: "csharp",
    signature: "net10.0",
    generation: 3,
    incomingRelations: 1,
    outgoingRelations: 3,
    locations: [{
      fileStableKey: "file:app",
      relativePath: "src/App/App.csproj",
      locationKind: "definition",
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1
    }]
  });

  assert.match(output, /Stable key: project:app/);
  assert.match(output, /src\/App\/App\.csproj:1:1/);
});

test("renders workspace orientation with facets, commands, and rule evidence", () => {
  const rendered = renderWorkspaceOrientation({
    atlasState: "current",
    generation: 2,
    workspaceKey: "workspace:test",
    workspaceName: "MixedApp",
    roots: ["E:\\Projects\\MixedApp"],
    coverage: {
      status: "partial",
      includedSources: ["dotnet_projects"],
      pendingSources: ["ci_workflows"]
    },
    projects: [{
      stableKey: "project:web",
      name: "Web",
      relativePath: "src/Web/Web.csproj",
      language: "csharp",
      projectKind: "web",
      sdk: "Microsoft.NET.Sdk.Web",
      facets: [{
        stableKey: "facet:web",
        facet: "aspnet_core_host",
        evidence: { relativePath: "src/Web/Web.csproj", line: 1, provenance: "msbuild" }
      }],
      buildDimensions: [{
        stableKey: "tfm:web",
        kind: "target_framework",
        value: "net10.0",
        evidence: { relativePath: "src/Web/Web.csproj", line: 3, provenance: "msbuild" }
      }]
    }],
    workspaceBuildDimensions: [],
    commands: [{
      stableKey: "command:web",
      targetKey: "project:web",
      kind: "run",
      name: "Run Web",
      commandText: "dotnet run --project src/Web/Web.csproj",
      workingDirectory: "E:\\Projects\\MixedApp",
      evidence: { relativePath: "src/Web/Web.csproj", line: 1, provenance: "derived_from_msbuild" }
    }],
    repositoryRules: [{
      stableKey: "rule:nullable",
      category: "msbuild_convention",
      name: "Nullable",
      value: "enable",
      summary: "Nullable = enable",
      scope: ".",
      authority: "structured_configuration",
      precedence: 85,
      evidence: { relativePath: "Directory.Build.props", line: 3, provenance: "msbuild" }
    }]
  }, "0.3.2");

  assert.match(rendered, /src\/Web\/Web\.csproj \| csharp \| aspnet_core_host/);
  assert.match(rendered, /Coverage: partial/);
  assert.match(rendered, /Pending sources: ci_workflows/);
  assert.match(rendered, /target_framework: net10\.0/);
  assert.match(rendered, /dotnet run --project/);
  assert.match(rendered, /P85 \| \. \| Nullable = enable/);
});
