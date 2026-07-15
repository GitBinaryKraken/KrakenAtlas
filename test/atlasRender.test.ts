import { strict as assert } from "node:assert";
import test from "node:test";
import {
  renderAtlasSummary,
  renderCodeUsages,
  renderEntityDetail,
  renderEntitySearch,
  renderRelations,
  renderRoute,
  renderSymbolSearch,
  renderWorkspaceOrientation
} from "../src/atlas/render";

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
      endColumn: 1,
      isGenerated: false
    }]
  });

  assert.match(output, /Stable key: project:app/);
  assert.match(output, /src\/App\/App\.csproj:1:1/);
});

test("renders bounded C# symbol search results with exact identity", () => {
  const output = renderSymbolSearch({
    atlasState: "current",
    generation: 5,
    query: "PersonaService",
    truncated: false,
    matches: [{
      id: 42,
      stableKey: "csharp_symbol:persona",
      kind: "class",
      name: "PersonaService",
      qualifiedName: "KelpApiLogicLayer.Services.PersonaService",
      signature: "public class KelpApiLogicLayer.Services.PersonaService",
      projectName: "KelpApiLogicLayer",
      projectRelativePath: "KelpApiLogicLayer/KelpApiLogicLayer.csproj",
      definitionCount: 1,
      firstDefinition: {
        fileStableKey: "file:persona",
        relativePath: "KelpApiLogicLayer/Services/PersonaService.cs",
        locationKind: "definition",
        startLine: 12,
        startColumn: 18,
        endLine: 12,
        endColumn: 32,
        isGenerated: false
      }
    }]
  });

  assert.match(output, /KelpApiLogicLayer\.Services\.PersonaService/);
  assert.match(output, /csharp_symbol:persona/);
  assert.match(output, /Services\/PersonaService\.cs:12:18/);
});

test("renders compiler-derived C# usages with relation and dispatch", () => {
  const output = renderCodeUsages({
    atlasState: "current",
    generation: 6,
    target: {
      id: 42,
      stableKey: "csharp_symbol:contract",
      kind: "method",
      name: "GetPublicPersona",
      qualifiedName: "KelpApiLogicLayer.Interfaces.IPersonaService.GetPublicPersona(string)",
      signature: "public abstract Task<Persona> GetPublicPersona(string url)"
    },
    truncated: false,
    usages: [{
      sourceId: 84,
      sourceStableKey: "csharp_symbol:controller",
      sourceKind: "method",
      sourceName: "Get",
      sourceQualifiedName: "KelpApi.Controllers.PersonaController.Get(string)",
      relationKind: "calls",
      dispatchKind: "interface",
      projectName: "KelpApi",
      projectRelativePath: "KelpApi/KelpApi.csproj",
      evidence: {
        fileStableKey: "file:controller",
        relativePath: "KelpApi/Controllers/PersonaController.cs",
        locationKind: "usage",
        startLine: 31,
        startColumn: 24,
        endLine: 31,
        endColumn: 58,
        isGenerated: false
      }
    }]
  });

  assert.match(output, /GetPublicPersona/);
  assert.match(output, /calls \| interface/);
  assert.match(output, /PersonaController\.cs:31:24/);
  assert.match(output, /csharp_symbol:controller/);
});

test("renders cross-domain entity, relation, and route queries", () => {
  const endpoint = {
    id: 20,
    stableKey: "http_endpoint:persona",
    kind: "http_endpoint",
    name: "GET /Persona",
    qualifiedName: "GET /Persona",
    signature: "GET /Persona | anonymous"
  };
  const handler = {
    id: 21,
    stableKey: "csharp_symbol:handler",
    kind: "method",
    name: "Get",
    qualifiedName: "Api.PersonaController.Get(string)",
    signature: "public Task<IActionResult> Get(string url)"
  };
  const evidence = {
    fileStableKey: "file:controller",
    relativePath: "Api/PersonaController.cs",
    locationKind: "evidence",
    startLine: 14,
    startColumn: 5,
    endLine: 14,
    endColumn: 8,
    isGenerated: false
  };
  const relation = {
    relationId: 31,
    source: endpoint,
    target: handler,
    domain: "framework",
    kind: "handled_by",
    dispatchKind: "direct",
    logicalScope: "anonymous",
    projectName: "Api",
    projectRelativePath: "Api/Api.csproj",
    evidence
  };

  const search = renderEntitySearch({
    atlasState: "current",
    generation: 7,
    query: "Persona",
    truncated: false,
    matches: [{
      ...endpoint,
      language: "http",
      projectName: "Api",
      projectRelativePath: "Api/Api.csproj",
      firstLocation: evidence
    }]
  });
  assert.match(search, /http_endpoint \| GET \/Persona/);
  assert.match(search, /http_endpoint:persona/);

  const relations = renderRelations({
    atlasState: "current",
    generation: 7,
    focus: endpoint,
    direction: "outgoing",
    truncated: false,
    relations: [relation]
  });
  assert.match(relations, /framework\/handled_by\/direct/);
  assert.match(relations, /PersonaController\.cs:14:5/);

  const route = renderRoute({
    atlasState: "current",
    generation: 7,
    source: endpoint,
    target: handler,
    waypoints: [],
    found: true,
    graphTruncated: false,
    maxDepth: 12,
    visitedEntities: 2,
    steps: [{ ordinal: 1, relation }]
  });
  assert.match(route, /Found: true/);
  assert.match(route, /1\. framework\/handled_by\/direct/);
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
