import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { FileRecord, ReferenceRecord, RelationshipRecord, SymbolRecord } from "../src/model/records";
import { createProjectMetadata } from "../src/storage/projectMetadata";
import { openSqliteIndex, rebuildSqliteIndex } from "../src/storage/sqliteIndex";

test("rebuildSqliteIndex creates queryable files and search records", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-sqlite-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const files: FileRecord[] = [
    {
      recordType: "file",
      id: "file:Controllers/UserController.cs",
      path: "Controllers/UserController.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 42,
      sha256: "a".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["controller", "csharp", "source"]
    },
    {
      recordType: "file",
      id: "file:wwwroot/js/user-form.js",
      path: "wwwroot/js/user-form.js",
      extension: ".js",
      language: "javascript",
      sizeBytes: 21,
      sha256: "b".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["javascript", "source", "static-asset"]
    }
  ];
  const project = createProjectMetadata({
    workspaceRoot: root,
    files,
    symbols: [],
    references: [],
    relationships: [],
    patternsCount: 0,
    analyzerRuns: []
  });

  await rebuildSqliteIndex(indexPath, { files, project });

  const database = await openSqliteIndex(indexPath);
  try {
    const fileCount = database.exec("SELECT COUNT(*) AS count FROM files;")[0].values[0][0];
    const searchCount = database.exec("SELECT COUNT(*) AS count FROM code_search WHERE record_type = 'file';")[0].values[0][0];
    const controllerPath = database.exec("SELECT path FROM files WHERE language = 'csharp';")[0].values[0][0];
    const projectJson = database.exec("SELECT json FROM metadata WHERE key = 'project';")[0].values[0][0] as string;
    const projectMetadata = JSON.parse(projectJson);

    assert.strictEqual(fileCount, 2);
    assert.strictEqual(searchCount, 2);
    assert.strictEqual(controllerPath, "Controllers/UserController.cs");
    assert.strictEqual(projectMetadata.primaryLanguage, "csharp");
  } finally {
    database.close();
  }
});

test("rebuildSqliteIndex creates relationship graph indexes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-edges-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");

  await rebuildSqliteIndex(indexPath, {
    files: [],
    patterns: [
      {
        recordType: "pattern",
        id: "pattern:dotnet:constructor-injection",
        name: "Constructor injection",
        category: "dependency-management",
        language: "csharp",
        confidence: 0.55,
        frequency: 2,
        counterExampleCount: 0,
        instances: [],
        rulesObserved: ["Types receive dependencies through constructor parameters."],
        agentGuidance: "Prefer constructor injection."
      }
    ],
    relationships: [
      {
        recordType: "relationship",
        id: "relationship:csharp:implements:UserService:IUserService",
        from: "symbol:csharp:UserService",
        to: "symbol:csharp:IUserService",
        type: "IMPLEMENTS",
        file: "Services/UserService.cs",
        range: {
          startLine: 4,
          startColumn: 1,
          endLine: 4,
          endColumn: 42
        },
        evidence: "public class UserService : IUserService",
        confidence: 1
      }
    ]
  });

  const database = await openSqliteIndex(indexPath);
  try {
    const edge = database.exec("SELECT from_id, to_id, type, source_kind, json FROM relationships WHERE to_id = 'symbol:csharp:IUserService';")[0].values[0];
    const pattern = database.exec("SELECT name FROM patterns WHERE id = 'pattern:dotnet:constructor-injection';")[0].values[0][0];
    const indexNames = database.exec("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'relationships' ORDER BY name;")[0].values.flat();
    const relationshipJson = JSON.parse(edge[4] as string);

    assert.deepStrictEqual(edge.slice(0, 4), ["symbol:csharp:UserService", "symbol:csharp:IUserService", "IMPLEMENTS", "compiler-resolved"]);
    assert.strictEqual(relationshipJson.sourceKind, "compiler-resolved");
    assert.strictEqual(pattern, "Constructor injection");
    assert.ok(indexNames.includes("idx_relationships_from"));
    assert.ok(indexNames.includes("idx_relationships_to"));
    assert.ok(indexNames.includes("idx_relationships_type"));
    assert.ok(indexNames.includes("idx_relationships_source_kind"));
  } finally {
    database.close();
  }
});

test("rebuildSqliteIndex creates node project enrichment", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-node-projects-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const requestId = "symbol:csharp:KelpApiDomain.SavePageDraftRequest";
  const files: FileRecord[] = [
    fileRecord("KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"),
    fileRecord("Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs"),
    fileRecord("KelpApi/Controllers/PageController.cs")
  ];
  const symbols: SymbolRecord[] = [{
    recordType: "symbol",
    id: requestId,
    name: "SavePageDraftRequest",
    fullyQualifiedName: "KelpApiDomain.SavePageDraftRequest",
    kind: "class",
    language: "csharp",
    file: "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs",
    range: range(),
    confidence: 1
  }, {
    recordType: "symbol",
    id: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.PageTitle",
    name: "PageTitle",
    fullyQualifiedName: "KelpApiDomain.SavePageDraftRequest.PageTitle",
    kind: "property",
    language: "csharp",
    file: "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs",
    range: range(),
    confidence: 1
  }];
  const references: ReferenceRecord[] = [
    {
      recordType: "reference",
      id: "reference:csharp:webui-save-page-draft",
      symbolName: "SavePageDraftRequest",
      resolvedSymbolId: requestId,
      file: "Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs",
      range: range(),
      context: "type-usage",
      snippet: "new SavePageDraftRequest",
      confidence: 0.9
    },
    {
      recordType: "reference",
      id: "reference:csharp:api-save-page-draft",
      symbolName: "SavePageDraftRequest",
      resolvedSymbolId: requestId,
      file: "KelpApi/Controllers/PageController.cs",
      range: range(),
      context: "parameter",
      snippet: "SavePageDraftRequest request",
      confidence: 0.9
    }
  ];
  const relationships: RelationshipRecord[] = [{
    recordType: "relationship",
    id: "relationship:maps-property:save-page-draft",
    from: "symbol:csharp:KelpApiDomain.ComposableEditorDocumentViewModel.PageTitle",
    to: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.PageTitle",
    type: "MAPS_PROPERTY",
    file: "Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs",
    range: range(),
    evidence: "PageTitle = model.PageTitle",
    confidence: 0.82
  }];

  await rebuildSqliteIndex(indexPath, { files, symbols, references, relationships });

  const database = await openSqliteIndex(indexPath);
  try {
    const rows = database.exec(
      `SELECT project, role, evidence_count
       FROM node_projects
       WHERE node_id = '${requestId}'
       ORDER BY project, role;`
    )[0].values;
    const indexNames = database.exec("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'node_projects' ORDER BY name;")[0].values.flat();

    assert.deepStrictEqual(rows, [
      ["Kelp2025_WebUI", "referenced", 1],
      ["Kelp2025_WebUI", "related", 1],
      ["KelpApi", "referenced", 1],
      ["KelpApiDomain", "declared", 1]
    ]);
    assert.ok(indexNames.includes("idx_node_projects_node"));
    assert.ok(indexNames.includes("idx_node_projects_project"));
  } finally {
    database.close();
  }
});

test("rebuildSqliteIndex creates node role enrichment", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-node-roles-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const requestId = "symbol:csharp:KelpApiDomain.SavePageDraftRequest";
  const controllerId = "symbol:csharp:KelpApi.Controllers.PageController";
  const serviceId = "symbol:csharp:Kelp2025_WebUI.Services.PageEditorService";
  const formId = "symbol:razor:Kelp2025_WebUI/Views/Pages/Edit.cshtml:form:save-page";
  const projectId = "symbol:dotnet-project:Kelp2025_WebUI/Kelp2025_WebUI.csproj";
  const typeCodeId = "symbol:csharp:KelpApiDomain.ViewModels.Persona.PersonaDetailTypeCode";
  const files: FileRecord[] = [
    fileRecord("KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"),
    fileRecord("KelpApiDomain/ViewModels/Persona/PersonaDetailTypeCode.cs"),
    fileRecord("KelpApi/Controllers/PageController.cs"),
    fileRecord("Kelp2025_WebUI/Services/PageEditorService.cs"),
    fileRecord("Kelp2025_WebUI/Views/Pages/Edit.cshtml"),
    fileRecord("Kelp2025_WebUI/Kelp2025_WebUI.csproj")
  ];
  const symbols: SymbolRecord[] = [
    symbolRecord(requestId, "SavePageDraftRequest", "KelpApiDomain.SavePageDraftRequest", "class", "csharp", "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"),
    symbolRecord(controllerId, "PageController", "KelpApi.Controllers.PageController", "class", "csharp", "KelpApi/Controllers/PageController.cs"),
    symbolRecord(serviceId, "PageEditorService", "Kelp2025_WebUI.Services.PageEditorService", "class", "csharp", "Kelp2025_WebUI/Services/PageEditorService.cs"),
    symbolRecord(formId, "save-page", "save-page", "form", "razor", "Kelp2025_WebUI/Views/Pages/Edit.cshtml", ["html-form"]),
    symbolRecord(projectId, "Kelp2025_WebUI", "Kelp2025_WebUI/Kelp2025_WebUI.csproj", "project", "dotnet-project", "Kelp2025_WebUI/Kelp2025_WebUI.csproj", ["dotnet-project"]),
    symbolRecord(typeCodeId, "PersonaDetailTypeCode", "KelpApiDomain.ViewModels.Persona.PersonaDetailTypeCode", "enum", "csharp", "KelpApiDomain/ViewModels/Persona/PersonaDetailTypeCode.cs")
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols });

  const database = await openSqliteIndex(indexPath);
  try {
    const roleRows = database.exec(
      `SELECT node_id, role
       FROM node_roles
       ORDER BY node_id, role;`
    )[0].values.map(([nodeId, role]) => `${nodeId}:${role}`);
    const requestRoles = database.exec(
      `SELECT role, source
       FROM node_roles
       WHERE node_id = '${requestId}'
       ORDER BY role, source;`
    )[0].values;
    const indexNames = database.exec("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'node_roles' ORDER BY name;")[0].values.flat();

    assert.ok(roleRows.includes(`${requestId}:domain-contract`));
    assert.ok(roleRows.includes(`${requestId}:request-dto`));
    assert.ok(roleRows.includes(`${controllerId}:controller`));
    assert.ok(roleRows.includes(`${serviceId}:service`));
    assert.ok(roleRows.includes(`${formId}:form`));
    assert.ok(roleRows.includes(`${projectId}:project`));
    assert.ok(roleRows.includes(`${typeCodeId}:type-code-contract`));
    assert.ok(requestRoles.some(([role, source]) => role === "domain-contract" && source === "project-name"));
    assert.ok(indexNames.includes("idx_node_roles_node"));
    assert.ok(indexNames.includes("idx_node_roles_role"));
  } finally {
    database.close();
  }
});

test("rebuildSqliteIndex creates node tag enrichment", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-node-tags-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const requestId = "symbol:csharp:KelpApiDomain.SavePageDraftRequest";
  const files: FileRecord[] = [
    fileRecord("KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"),
    fileRecord("Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs")
  ];
  const symbols: SymbolRecord[] = [
    symbolRecord(requestId, "SavePageDraftRequest", "KelpApiDomain.SavePageDraftRequest", "class", "csharp", "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"),
    symbolRecord("symbol:csharp:KelpApiDomain.SavePageDraftRequest.MetaDescription", "MetaDescription", "KelpApiDomain.SavePageDraftRequest.MetaDescription", "property", "csharp", "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs")
  ];
  const references: ReferenceRecord[] = [{
    recordType: "reference",
    id: "reference:csharp:webui-save-page-draft",
    symbolName: "SavePageDraftRequest",
    resolvedSymbolId: requestId,
    file: "Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs",
    range: range(),
    context: "type-usage",
    snippet: "new SavePageDraftRequest",
    confidence: 0.9
  }];
  const relationships: RelationshipRecord[] = [{
    recordType: "relationship",
    id: "relationship:maps-property:metadata-description",
    from: "symbol:csharp:KelpApiDomain.ComposableEditorDocumentViewModel.MetaDescription",
    to: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.MetaDescription",
    type: "MAPS_PROPERTY",
    file: "Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs",
    range: range(),
    evidence: "MetaDescription = model.MetaDescription",
    confidence: 0.82
  }];

  await rebuildSqliteIndex(indexPath, { files, symbols, references, relationships });

  const database = await openSqliteIndex(indexPath);
  try {
    const requestTags = database.exec(
      `SELECT tag
       FROM node_tags
       WHERE node_id = '${requestId}'
       ORDER BY tag;`
    )[0].values.flat();
    const metaTags = database.exec(
      `SELECT tag
       FROM node_tags
       WHERE node_id = 'symbol:csharp:KelpApiDomain.SavePageDraftRequest.MetaDescription'
       ORDER BY tag;`
    )[0].values.flat();
    const indexNames = database.exec("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'node_tags' ORDER BY name;")[0].values.flat();

    assert.ok(requestTags.includes("page-draft"));
    assert.ok(requestTags.includes("save-page-draft"));
    assert.ok(requestTags.includes("meta-description"));
    assert.ok(metaTags.includes("meta-description"));
    assert.ok(indexNames.includes("idx_node_tags_node"));
    assert.ok(indexNames.includes("idx_node_tags_tag"));
  } finally {
    database.close();
  }
});

test("rebuildSqliteIndex creates node member enrichment", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-node-members-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const requestId = "symbol:csharp:KelpApiDomain.SavePageDraftRequest";
  const files: FileRecord[] = [
    fileRecord("KelpApiDomain/ViewModels/Pages/PageDraftModels.cs")
  ];
  const symbols: SymbolRecord[] = [
    symbolRecord(requestId, "SavePageDraftRequest", "KelpApiDomain.SavePageDraftRequest", "class", "csharp", "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"),
    symbolRecord("symbol:csharp:KelpApiDomain.SavePageDraftRequest.PageTitle", "PageTitle", "KelpApiDomain.SavePageDraftRequest.PageTitle", "property", "csharp", "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"),
    symbolRecord("symbol:csharp:KelpApiDomain.SavePageDraftRequest.MetaDescription", "MetaDescription", "KelpApiDomain.SavePageDraftRequest.MetaDescription", "property", "csharp", "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"),
    symbolRecord("symbol:csharp:KelpApiDomain.SavePageDraftRequest.Render", "Render", "KelpApiDomain.SavePageDraftRequest.Render()", "method", "csharp", "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs")
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols });

  const database = await openSqliteIndex(indexPath);
  try {
    const rows = database.exec(
      `SELECT member_id, member_name, member_kind, type_name, required, nullable
       FROM node_members
       WHERE node_id = '${requestId}'
       ORDER BY member_name;`
    )[0].values;
    const indexNames = database.exec("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'node_members' ORDER BY name;")[0].values.flat();

    assert.deepStrictEqual(rows, [
      ["symbol:csharp:KelpApiDomain.SavePageDraftRequest.MetaDescription", "MetaDescription", "property", null, null, null],
      ["symbol:csharp:KelpApiDomain.SavePageDraftRequest.PageTitle", "PageTitle", "property", null, null, null]
    ]);
    assert.ok(indexNames.includes("idx_node_members_node"));
    assert.ok(indexNames.includes("idx_node_members_name"));
  } finally {
    database.close();
  }
});

test("rebuildSqliteIndex creates node usage summary enrichment", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-node-usage-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const serviceId = "symbol:csharp:Domain.UserService";
  const files: FileRecord[] = [
    fileRecord("Web/Program.cs"),
    fileRecord("Web/Controllers/UserController.cs"),
    fileRecord("Domain/UserService.cs")
  ];
  const symbols: SymbolRecord[] = [
    symbolRecord(serviceId, "UserService", "Domain.UserService", "class", "csharp", "Domain/UserService.cs"),
    symbolRecord("symbol:csharp:Web.Controllers.UserController", "UserController", "Web.Controllers.UserController", "class", "csharp", "Web/Controllers/UserController.cs")
  ];
  const references: ReferenceRecord[] = [{
    recordType: "reference",
    id: "reference:csharp:user-service",
    symbolName: "UserService",
    resolvedSymbolId: serviceId,
    file: "Web/Controllers/UserController.cs",
    range: range(),
    context: "type-usage",
    snippet: "UserService service",
    confidence: 0.9
  }];
  const relationships: RelationshipRecord[] = [
    relationshipRecord("relationship:registers:user-service", "symbol:dotnet-project:Web/Web.csproj", serviceId, "REGISTERS", "Web/Program.cs"),
    relationshipRecord("relationship:middleware:auth", "symbol:csharp:Web.Program", "symbol:csharp:Web.AuthMiddleware", "USES_MIDDLEWARE", "Web/Program.cs"),
    relationshipRecord("relationship:route:user", "symbol:csharp:Web.Controllers.UserController", "route:csharp:/users", "MAPS_ROUTE", "Web/Controllers/UserController.cs"),
    relationshipRecord("relationship:calls:user-service", "symbol:csharp:Web.Controllers.UserController", serviceId, "CALLS", "Web/Controllers/UserController.cs"),
    relationshipRecord("relationship:queries:user-service", serviceId, "symbol:csharp:Domain.AppDbContext.Users", "QUERIES", "Domain/UserService.cs")
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols, references, relationships });

  const database = await openSqliteIndex(indexPath);
  try {
    const rows = database.exec(
      `SELECT node_id, incoming_count, outgoing_count, reference_count, project_count, hotspot_score, avoid_initially
       FROM node_usage_summary
       WHERE node_id IN ('file:Web/Program.cs', '${serviceId}')
       ORDER BY node_id;`
    )[0].values;
    const indexNames = database.exec("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'node_usage_summary' ORDER BY name;")[0].values.flat();

    assert.deepStrictEqual(rows, [
      ["file:Web/Program.cs", 0, 2, 0, 1, 14, 1],
      [serviceId, 2, 1, 1, 2, 6, 0]
    ]);
    assert.ok(indexNames.includes("idx_node_usage_hotspot"));
    assert.ok(indexNames.includes("idx_node_usage_avoid"));
  } finally {
    database.close();
  }
});

function fileRecord(filePath: string): FileRecord {
  return {
    recordType: "file",
    id: `file:${filePath}`,
    path: filePath,
    extension: path.extname(filePath),
    language: filePath.endsWith(".cs") ? "csharp" : "unknown",
    sizeBytes: 42,
    sha256: "c".repeat(64),
    modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
    isGenerated: false,
    tags: ["source"]
  };
}

function relationshipRecord(id: string, from: string, to: string, type: string, file: string): RelationshipRecord {
  return {
    recordType: "relationship",
    id,
    from,
    to,
    type,
    file,
    range: range(),
    evidence: `${from} -> ${to}`,
    confidence: 0.9
  };
}

function symbolRecord(
  id: string,
  name: string,
  fullyQualifiedName: string,
  kind: string,
  language: string,
  file: string,
  patterns: string[] = []
): SymbolRecord {
  return {
    recordType: "symbol",
    id,
    name,
    fullyQualifiedName,
    kind,
    language,
    file,
    range: range(),
    confidence: 1,
    patterns
  };
}

function range() {
  return {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 1
  };
}
