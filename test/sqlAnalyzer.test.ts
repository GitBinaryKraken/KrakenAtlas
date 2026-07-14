import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { analyzeCSharpModelProjections } from "../src/analyzers/csharpProjectionAnalyzer";
import { analyzeSqlDataAccess } from "../src/analyzers/sqlAnalyzer";
import type { RelationshipRecord, SourceRange, SymbolRecord } from "../src/model/records";
import { detectPatterns } from "../src/patterns/patternDetector";
import { QueryService } from "../src/query/queryService";
import { scanWorkspaceFiles } from "../src/scanner/fileScanner";
import { openSqliteIndex, rebuildSqliteIndex } from "../src/storage/sqliteIndex";

test("SQL analyzer maps table nodes, table operations, roles, and template-backed patterns", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-sql-analyzer-"));
  await fs.mkdir(path.join(root, "AdminTools", "Services"), { recursive: true });
  await fs.mkdir(path.join(root, "AdminTools", "Models"), { recursive: true });
  await fs.mkdir(path.join(root, "KelpPostGresData", "Services"), { recursive: true });
  await fs.mkdir(path.join(root, "KelpApiDomain", "ViewModels", "Persona"), { recursive: true });
  await fs.mkdir(path.join(root, "KelpApiLogicLayer", "Extentions"), { recursive: true });
  await fs.mkdir(path.join(root, "KelpPostGresDomain", "DataModels", "GeneratedTables"), { recursive: true });
  await fs.mkdir(path.join(root, "KelpPostGresDomain", "DataModels", "Personas"), { recursive: true });
  await fs.mkdir(path.join(root, "DatabaseSeeds"), { recursive: true });

  await fs.writeFile(path.join(root, "AdminTools", "Services", "ObjectManagementService.cs"), `
public class ObjectManagementService
{
    public Task SaveTypeAsync(SaveTypeRequest request)
    {
        const string sql = @"
            INSERT INTO public.objecttypes (uid, typecode, parentcategory)
            VALUES (@Uid, @TypeCode, @ParentCategory)
            ON CONFLICT (uid) DO UPDATE SET
                typecode = EXCLUDED.typecode;";
        return connection.ExecuteAsync(sql, request);
    }
}
`, "utf8");

  await fs.writeFile(path.join(root, "AdminTools", "Models", "SaveTypeRequest.cs"), `
namespace AdminTools.Models;

public record SaveTypeRequest(string Uid, int TypeCode, string ParentCategory);
`, "utf8");

  await fs.writeFile(path.join(root, "KelpPostGresDomain", "DataModels", "GeneratedTables", "PersonaDetailTemplatesTableDataModel.cs"), `
public class PersonaDetailTemplatesTableDataModel : ComposablePartTemplateTableDataModelBase;
`, "utf8");

  await fs.writeFile(path.join(root, "KelpPostGresDomain", "DataModels", "Personas", "PersonaInfoFieldDataModel.cs"), `
public class PersonaInfoFieldDataModel
{
    public int TypeCode { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string DatasourceSid { get; set; } = string.Empty;
}
`, "utf8");

  await fs.writeFile(path.join(root, "KelpApiDomain", "ViewModels", "Persona", "PersonaDetailFieldViewModel.cs"), `
public class PersonaDetailFieldViewModel
{
    public int TypeCode { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string DatasourceSid { get; set; } = string.Empty;
}
`, "utf8");

  await fs.writeFile(path.join(root, "KelpApiLogicLayer", "Extentions", "PersonaMappingExtensions.cs"), `
public static class PersonaMappingExtensions
{
    public static PersonaDetailFieldViewModel ToViewModel(this PersonaInfoFieldDataModel data)
    {
        return new PersonaDetailFieldViewModel
        {
            TypeCode = data.TypeCode,
            Title = data.Title,
            Description = data.Description,
            DatasourceSid = data.DatasourceSid
        };
    }
}
`, "utf8");

  await fs.writeFile(path.join(root, "KelpPostGresData", "Services", "PersonaDataService.cs"), `
public class PersonaDataService
{
    public Task GetPersonaInfo()
    {
        const string sql = @"
            SELECT t.uid, ot.typecode
            FROM public.persona_detail_templates t
            JOIN LATERAL (
                SELECT 1 AS sort_order
            ) ordering ON TRUE
            JOIN public.objecttypes ot
                ON ot.parentcategory::text = t.datasource_sid;";
        return connection.QueryAsync<PersonaDetailTemplatesTableDataModel>(sql);
    }

    public async Task<IReadOnlyList<PersonaInfoFieldDataModel>> BuildFields()
    {
        const string sql = @"
            SELECT t.type_code, t.datasource_sid, translation.displayname AS title, translation.description
            FROM public.persona_detail_templates t
            LEFT JOIN public.objecttypetranslations translation
                ON translation.objecttypeuid = t.uid;";
        var templateRows = (await connection.QueryAsync<PersonaTemplateRow>(sql)).ToList();
        var fields = new List<PersonaInfoFieldDataModel>();

        foreach (var template in templateRows)
        {
            fields.Add(new PersonaInfoFieldDataModel
            {
                TypeCode = template.TypeCode,
                Title = template.Title,
                Description = template.Description,
                DatasourceSid = template.DatasourceSid
            });
        }

        return fields;
    }

    private sealed class PersonaTemplateRow
    {
        public int TypeCode { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string DatasourceSid { get; set; } = string.Empty;
    }
}
`, "utf8");

  await fs.writeFile(path.join(root, "DatabaseSeeds", "060_persona_details.sql"), `
INSERT INTO public.persona_detail_templates (uid, type_code, datasource_sid)
VALUES ('favorite-beverage', 7201, 'tropical-beverage-options');
`, "utf8");

  const files = await scanWorkspaceFiles(root, { outputFolder: ".kraken-atlas" });
  const sqlFile = files.find((file) => file.path === "DatabaseSeeds/060_persona_details.sql");
  assert.ok(sqlFile);
  assert.strictEqual(sqlFile.language, "sql");
  assert.ok(sqlFile.tags.includes("source"));

  const csharpSymbols: SymbolRecord[] = [
    csharpSymbol(
      "symbol:csharp:AdminTools.Models.SaveTypeRequest",
      "SaveTypeRequest",
      "AdminTools.Models.SaveTypeRequest",
      "record",
      "AdminTools/Models/SaveTypeRequest.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpPostGresDomain.DataModels.GeneratedTables.PersonaDetailTemplatesTableDataModel",
      "PersonaDetailTemplatesTableDataModel",
      "KelpPostGresDomain.DataModels.GeneratedTables.PersonaDetailTemplatesTableDataModel",
      "class",
      "KelpPostGresDomain/DataModels/GeneratedTables/PersonaDetailTemplatesTableDataModel.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpPostGresData.Services.PersonaDataService.PersonaTemplateRow",
      "PersonaTemplateRow",
      "KelpPostGresData.Services.PersonaDataService.PersonaTemplateRow",
      "class",
      "KelpPostGresData/Services/PersonaDataService.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpPostGresData.Services.PersonaDataService.PersonaTemplateRow.TypeCode",
      "TypeCode",
      "KelpPostGresData.Services.PersonaDataService.PersonaTemplateRow.TypeCode",
      "property",
      "KelpPostGresData/Services/PersonaDataService.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpPostGresData.Services.PersonaDataService.PersonaTemplateRow.Title",
      "Title",
      "KelpPostGresData.Services.PersonaDataService.PersonaTemplateRow.Title",
      "property",
      "KelpPostGresData/Services/PersonaDataService.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpPostGresData.Services.PersonaDataService.PersonaTemplateRow.Description",
      "Description",
      "KelpPostGresData.Services.PersonaDataService.PersonaTemplateRow.Description",
      "property",
      "KelpPostGresData/Services/PersonaDataService.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpPostGresData.Services.PersonaDataService.PersonaTemplateRow.DatasourceSid",
      "DatasourceSid",
      "KelpPostGresData.Services.PersonaDataService.PersonaTemplateRow.DatasourceSid",
      "property",
      "KelpPostGresData/Services/PersonaDataService.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel",
      "PersonaInfoFieldDataModel",
      "KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel",
      "class",
      "KelpPostGresDomain/DataModels/Personas/PersonaInfoFieldDataModel.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel.TypeCode",
      "TypeCode",
      "KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel.TypeCode",
      "property",
      "KelpPostGresDomain/DataModels/Personas/PersonaInfoFieldDataModel.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel.Title",
      "Title",
      "KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel.Title",
      "property",
      "KelpPostGresDomain/DataModels/Personas/PersonaInfoFieldDataModel.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel.Description",
      "Description",
      "KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel.Description",
      "property",
      "KelpPostGresDomain/DataModels/Personas/PersonaInfoFieldDataModel.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel.DatasourceSid",
      "DatasourceSid",
      "KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel.DatasourceSid",
      "property",
      "KelpPostGresDomain/DataModels/Personas/PersonaInfoFieldDataModel.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpApiDomain.ViewModels.Persona.PersonaDetailFieldViewModel",
      "PersonaDetailFieldViewModel",
      "KelpApiDomain.ViewModels.Persona.PersonaDetailFieldViewModel",
      "class",
      "KelpApiDomain/ViewModels/Persona/PersonaDetailFieldViewModel.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpApiDomain.ViewModels.Persona.PersonaDetailFieldViewModel.TypeCode",
      "TypeCode",
      "KelpApiDomain.ViewModels.Persona.PersonaDetailFieldViewModel.TypeCode",
      "property",
      "KelpApiDomain/ViewModels/Persona/PersonaDetailFieldViewModel.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpApiDomain.ViewModels.Persona.PersonaDetailFieldViewModel.Title",
      "Title",
      "KelpApiDomain.ViewModels.Persona.PersonaDetailFieldViewModel.Title",
      "property",
      "KelpApiDomain/ViewModels/Persona/PersonaDetailFieldViewModel.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpApiDomain.ViewModels.Persona.PersonaDetailFieldViewModel.Description",
      "Description",
      "KelpApiDomain.ViewModels.Persona.PersonaDetailFieldViewModel.Description",
      "property",
      "KelpApiDomain/ViewModels/Persona/PersonaDetailFieldViewModel.cs"
    ),
    csharpSymbol(
      "symbol:csharp:KelpApiDomain.ViewModels.Persona.PersonaDetailFieldViewModel.DatasourceSid",
      "DatasourceSid",
      "KelpApiDomain.ViewModels.Persona.PersonaDetailFieldViewModel.DatasourceSid",
      "property",
      "KelpApiDomain/ViewModels/Persona/PersonaDetailFieldViewModel.cs"
    )
  ];

  const result = await analyzeSqlDataAccess(root, files, csharpSymbols);
  const modelPropertyRelationships = [
    csharpPropertyMapRelationship("TypeCode", 8),
    csharpPropertyMapRelationship("Title", 9),
    csharpPropertyMapRelationship("Description", 10),
    csharpPropertyMapRelationship("DatasourceSid", 11)
  ];
  const modelProjection = analyzeCSharpModelProjections(csharpSymbols, modelPropertyRelationships);
  const tableIds = result.symbols.map((symbol) => symbol.id);
  assert.ok(tableIds.includes("table:public.objecttypes"));
  assert.ok(tableIds.includes("table:public.persona_detail_templates"));
  assert.ok(!tableIds.includes("table:lateral"));
  assert.ok(tableIds.includes("row:public.persona_detail_templates:uid:favorite-beverage"));
  assert.ok(tableIds.includes("type-code:7201"));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "UPSERTS_TABLE" &&
    relationship.file === "AdminTools/Services/ObjectManagementService.cs" &&
    relationship.to === "table:public.objecttypes"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "READS_TABLE" &&
    relationship.file === "KelpPostGresData/Services/PersonaDataService.cs" &&
    relationship.to === "table:public.persona_detail_templates"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "JOINS_TABLE" &&
    relationship.file === "KelpPostGresData/Services/PersonaDataService.cs" &&
    relationship.to === "table:public.objecttypes"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "BACKS_TABLE" &&
    relationship.file === "KelpPostGresDomain/DataModels/GeneratedTables/PersonaDetailTemplatesTableDataModel.cs" &&
    relationship.to === "table:public.persona_detail_templates"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "INSERTS_ROW" &&
    relationship.file === "DatabaseSeeds/060_persona_details.sql" &&
    relationship.to === "row:public.persona_detail_templates:uid:favorite-beverage"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "ROW_IN_TABLE" &&
    relationship.from === "row:public.persona_detail_templates:uid:favorite-beverage" &&
    relationship.to === "table:public.persona_detail_templates"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "ROW_HAS_TYPE_CODE" &&
    relationship.from === "row:public.persona_detail_templates:uid:favorite-beverage" &&
    relationship.to === "type-code:7201"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "MAPS_DAPPER_RESULT" &&
    relationship.from === "table:public.persona_detail_templates" &&
    relationship.to === "symbol:csharp:KelpPostGresDomain.DataModels.GeneratedTables.PersonaDetailTemplatesTableDataModel"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "USES_DAPPER_PARAMETER" &&
    relationship.from === "symbol:csharp:AdminTools.Models.SaveTypeRequest" &&
    relationship.to === "table:public.objecttypes"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "MAPS_DAPPER_RESULT" &&
    relationship.from === "table:public.persona_detail_templates" &&
    relationship.to === "symbol:csharp:KelpPostGresData.Services.PersonaDataService.PersonaTemplateRow"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "PROJECTS_DAPPER_ROW" &&
    relationship.from === "symbol:csharp:KelpPostGresData.Services.PersonaDataService.PersonaTemplateRow" &&
    relationship.to === "symbol:csharp:KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel"
  ));
  assert.ok(result.relationships.some((relationship) =>
    relationship.type === "MAPS_DAPPER_PROPERTY" &&
    relationship.from === "symbol:csharp:KelpPostGresData.Services.PersonaDataService.PersonaTemplateRow.TypeCode" &&
    relationship.to === "symbol:csharp:KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel.TypeCode"
  ));

  const noisyRelationship: RelationshipRecord = {
    recordType: "relationship",
    id: "relationship:test:noise:imageasset:publicurl",
    from: "symbol:csharp:KelpApiLogicLayer.Services.ImageAsset.PublicUrl",
    to: "symbol:csharp:KelpApiLogicLayer.Models.ImageAssetDto.PublicUrl",
    type: "MAPS_PROPERTY",
    file: "KelpApiLogicLayer/Services/ImageAssetService.cs",
    range: { startLine: 5, startColumn: 1, endLine: 5, endColumn: 20 },
    evidence: "documentation mention of table:public.persona_detail_templates",
    confidence: 0.9
  };
  const indexedRelationships = [...result.relationships, ...modelPropertyRelationships, ...modelProjection.relationships, noisyRelationship];
  const indexedSymbols = [...csharpSymbols, ...result.symbols];
  const patterns = detectPatterns({ symbols: indexedSymbols, relationships: indexedRelationships });
  assert.ok(patterns.some((pattern) => pattern.id === "pattern:data:sql-table-access"));
  assert.ok(patterns.some((pattern) => pattern.id === "pattern:data:dapper-type-binding"));
  assert.ok(patterns.some((pattern) => pattern.id === "pattern:dotnet:model-projection"));
  assert.ok(patterns.some((pattern) => pattern.id === "pattern:data:generated-table-model"));
  assert.ok(patterns.some((pattern) => pattern.id === "pattern:data:template-backed-runtime-field"));

  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  await rebuildSqliteIndex(indexPath, { files, symbols: indexedSymbols, relationships: indexedRelationships, patterns });
  const database = await openSqliteIndex(indexPath);
  try {
    const roleRows = selectRows(database, "SELECT role FROM node_roles WHERE node_id = ? ORDER BY role;", ["file:AdminTools/Services/ObjectManagementService.cs"]);
    const roles = roleRows.map((row) => String(row.role));
    assert.ok(roles.includes("admin-config-surface"));
    assert.ok(roles.includes("definition-source"));
    assert.ok(roles.includes("taxonomy-manager"));
    assert.ok(roles.includes("object-type-manager"));
    assert.ok(roles.includes("type-code-editor"));
    assert.ok(roles.includes("dapper-parameter-writer"));

    const tableRoleRows = selectRows(database, "SELECT role FROM node_roles WHERE node_id = ? ORDER BY role;", ["table:public.persona_detail_templates"]);
    const tableRoles = tableRoleRows.map((row) => String(row.role));
    assert.ok(tableRoles.includes("database-table"));
    assert.ok(tableRoles.includes("template-table"));

    const seedRoleRows = selectRows(database, "SELECT role FROM node_roles WHERE node_id = ? ORDER BY role;", ["file:DatabaseSeeds/060_persona_details.sql"]);
    const seedRoles = seedRoleRows.map((row) => String(row.role));
    assert.ok(seedRoles.includes("seed-source"));
    assert.ok(seedRoles.includes("definition-source"));
    assert.ok(seedRoles.includes("type-code-editor"));

    const rowRoleRows = selectRows(database, "SELECT role FROM node_roles WHERE node_id = ? ORDER BY role;", ["row:public.persona_detail_templates:uid:favorite-beverage"]);
    const rowRoles = rowRoleRows.map((row) => String(row.role));
    assert.ok(rowRoles.includes("database-row"));
    assert.ok(rowRoles.includes("seed-row"));

    const modelRoleRows = selectRows(database, "SELECT role FROM node_roles WHERE node_id = ? ORDER BY role;", ["file:KelpPostGresDomain/DataModels/GeneratedTables/PersonaDetailTemplatesTableDataModel.cs"]);
    const modelRoles = modelRoleRows.map((row) => String(row.role));
    assert.ok(modelRoles.includes("generated-table-model"));
    assert.ok(modelRoles.includes("template-table-model"));

    const runtimeRoleRows = selectRows(database, "SELECT role FROM node_roles WHERE node_id = ? ORDER BY role;", ["file:KelpPostGresData/Services/PersonaDataService.cs"]);
    const runtimeRoles = runtimeRoleRows.map((row) => String(row.role));
    assert.ok(runtimeRoles.includes("dapper-result-mapper"));
    assert.ok(runtimeRoles.includes("dapper-row-projector"));

    const mapperRoleRows = selectRows(database, "SELECT role FROM node_roles WHERE node_id = ? ORDER BY role;", ["file:KelpApiLogicLayer/Extentions/PersonaMappingExtensions.cs"]);
    const mapperRoles = mapperRoleRows.map((row) => String(row.role));
    assert.ok(mapperRoles.includes("model-projector"));

    const service = new QueryService(database);
    const tableRelationships = service.findRelationships("table:public.persona_detail_templates", { limit: 16 });
    assert.ok(tableRelationships.symbols.includes("table:public.persona_detail_templates"));
    assert.strictEqual(tableRelationships.relationships[0]?.to, "table:public.persona_detail_templates");
    assert.notStrictEqual(tableRelationships.relationships[0]?.type, "MAPS_PROPERTY");
    assert.ok(tableRelationships.relationships.some((relationship) =>
      relationship.type === "MAPS_DAPPER_RESULT" &&
      relationship.to === "symbol:csharp:KelpPostGresDomain.DataModels.GeneratedTables.PersonaDetailTemplatesTableDataModel"
    ));
    assert.ok(tableRelationships.relationships.some((relationship) =>
      relationship.type === "PROJECTS_DAPPER_ROW" &&
      relationship.to === "symbol:csharp:KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel"
    ));
    assert.ok(tableRelationships.relationships.some((relationship) =>
      relationship.type === "PROJECTS_MODEL" &&
      relationship.from === "symbol:csharp:KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel" &&
      relationship.to === "symbol:csharp:KelpApiDomain.ViewModels.Persona.PersonaDetailFieldViewModel"
    ));

    const typeRelationships = service.findRelationships("PersonaDetailTemplatesTableDataModel", { limit: 8 });
    assert.ok(typeRelationships.symbols.includes("symbol:csharp:KelpPostGresDomain.DataModels.GeneratedTables.PersonaDetailTemplatesTableDataModel"));
    assert.ok(typeRelationships.relationships.some((relationship) =>
      relationship.type === "MAPS_DAPPER_RESULT" &&
      relationship.from === "table:public.persona_detail_templates"
    ));

    const rowRelationships = service.findRelationships("PersonaTemplateRow", { limit: 12 });
    assert.ok(rowRelationships.relationships.some((relationship) =>
      relationship.type === "PROJECTS_DAPPER_ROW" &&
      relationship.to === "symbol:csharp:KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel"
    ));
    assert.ok(rowRelationships.relationships.some((relationship) =>
      relationship.type === "MAPS_DAPPER_PROPERTY" &&
      relationship.to === "symbol:csharp:KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel.TypeCode"
    ));

    const domainModelRelationships = service.findRelationships("PersonaInfoFieldDataModel", { limit: 12 });
    assert.ok(domainModelRelationships.relationships.some((relationship) =>
      relationship.type === "PROJECTS_MODEL" &&
      relationship.to === "symbol:csharp:KelpApiDomain.ViewModels.Persona.PersonaDetailFieldViewModel"
    ));

    const typeCodeRelationships = service.findRelationships("type-code:7201", { limit: 8 });
    assert.ok(typeCodeRelationships.symbols.includes("type-code:7201"));
    assert.ok(typeCodeRelationships.relationships.some((relationship) =>
      relationship.type === "ROW_HAS_TYPE_CODE" &&
      relationship.from === "row:public.persona_detail_templates:uid:favorite-beverage"
    ));

    const patternResponse = service.findPatterns("template-backed runtime field");
    assert.ok(patternResponse.files.includes("AdminTools/Services/ObjectManagementService.cs"));
    assert.ok(patternResponse.files.includes("KelpPostGresData/Services/PersonaDataService.cs"));
    assert.ok(patternResponse.symbols.includes("table:public.persona_detail_templates"));

    const where = service.whereToAdd("let a user, on their profile page, pick their favorite tropical beverage");
    assert.strictEqual(where.files[0], "AdminTools/Services/ObjectManagementService.cs");
    const adminRecommendation = where.evidence.find((item) =>
      item.recordType === "fileRecommendation" &&
      item.file === "AdminTools/Services/ObjectManagementService.cs"
    );
    const reasons = Array.isArray(adminRecommendation?.reasons) ? adminRecommendation.reasons : [];
    assert.ok(reasons.some((reason) => typeof reason === "string" && reason.startsWith("Source-of-truth role match:")));
  } finally {
    database.close();
  }
});

function csharpSymbol(id: string, name: string, fullyQualifiedName: string, kind: string, file: string): SymbolRecord {
  const range: SourceRange = { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 };
  return {
    recordType: "symbol",
    id,
    name,
    fullyQualifiedName,
    kind,
    language: "csharp",
    file,
    range,
    confidence: 0.9
  };
}

function csharpPropertyMapRelationship(propertyName: string, line: number): RelationshipRecord {
  const range: SourceRange = { startLine: line, startColumn: 13, endLine: line, endColumn: 40 };
  return {
    recordType: "relationship",
    id: `relationship:test:maps-property:${propertyName}`,
    from: `symbol:csharp:KelpPostGresDomain.DataModels.Personas.PersonaInfoFieldDataModel.${propertyName}`,
    to: `symbol:csharp:KelpApiDomain.ViewModels.Persona.PersonaDetailFieldViewModel.${propertyName}`,
    type: "MAPS_PROPERTY",
    file: "KelpApiLogicLayer/Extentions/PersonaMappingExtensions.cs",
    range,
    evidence: `${propertyName} = data.${propertyName}`,
    confidence: 0.82
  };
}

function selectRows(database: { prepare(sql: string): any }, sql: string, params: unknown[]): Array<Record<string, unknown>> {
  const statement = database.prepare(sql);
  try {
    statement.bind(params);
    const rows: Array<Record<string, unknown>> = [];
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
    return rows;
  } finally {
    statement.free();
  }
}
