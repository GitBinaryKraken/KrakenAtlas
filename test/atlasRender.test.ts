import { strict as assert } from "node:assert";
import test from "node:test";
import { renderAtlasSummary, renderEntityDetail } from "../src/atlas/render";

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
