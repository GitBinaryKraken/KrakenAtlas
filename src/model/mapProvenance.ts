import { RelationshipRecord } from "./records";

export type MapFactSourceKind =
  | "compiler-resolved"
  | "source-parsed"
  | "convention-derived"
  | "inferred"
  | "text-derived";

export function relationshipSourceKind(relationship: Pick<RelationshipRecord, "id" | "type" | "evidence" | "file"> | Record<string, unknown>): MapFactSourceKind {
  const id = stringField(relationship.id);
  const type = stringField(relationship.type);
  const evidence = stringField(relationship.evidence).toLowerCase();
  const file = stringField(relationship.file).replace(/\\/gu, "/").toLowerCase();

  if (id.startsWith("relationship:csharp-projection:")) {
    return "inferred";
  }
  if (id.startsWith("relationship:aspnet:")) {
    return "convention-derived";
  }
  if (id.startsWith("relationship:csharp-type-code:")) {
    return "source-parsed";
  }
  if (id.startsWith("relationship:sql:")) {
    return sqlRelationshipSourceKind(type);
  }
  if (id.startsWith("relationship:dotnet-project:") || type === "PROJECT_REFERENCES") {
    return "source-parsed";
  }
  if (id.includes(":csharp:") && compilerResolvedCSharpTypes.has(type)) {
    return "compiler-resolved";
  }
  if (/\b(import resolved|compiler-resolved|typescript resolver|module resolver)\b/u.test(evidence)) {
    return "compiler-resolved";
  }
  if (conventionRelationshipTypes.has(type)) {
    return "convention-derived";
  }
  if (inferredRelationshipTypes.has(type)) {
    return "inferred";
  }
  if (sourceParsedRelationshipTypes.has(type) || sourceLikeFile(file)) {
    return "source-parsed";
  }

  return "text-derived";
}

function sqlRelationshipSourceKind(type: string): MapFactSourceKind {
  if (["READS_TABLE", "JOINS_TABLE", "WRITES_TABLE", "UPSERTS_TABLE", "DELETES_FROM_TABLE", "INSERTS_ROW"].includes(type)) {
    return "source-parsed";
  }
  return "inferred";
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sourceLikeFile(file: string): boolean {
  return /\.(cs|cshtml|razor|js|jsx|ts|tsx|html|htm|sql|json|csproj)$/u.test(file);
}

const compilerResolvedCSharpTypes = new Set([
  "CALLS",
  "IMPLEMENTS",
  "INJECTS",
  "REGISTERS",
  "RETURNS_TYPE",
  "VALIDATES",
  "USES_VALIDATOR",
  "HANDLES_REQUEST",
  "DBSET_FOR",
  "USES_DBSET",
  "QUERIES",
  "WRITES",
  "CALLS_REPOSITORY",
  "BINDS_OPTIONS",
  "USES_OPTIONS",
  "USES_CONFIG_KEY",
  "RUNS_HOSTED_SERVICE",
  "USES_MIDDLEWARE",
  "MAPS_ROUTE"
]);

const conventionRelationshipTypes = new Set([
  "RENDERS_VIEW",
  "CALLS_INJECTED_SERVICE",
  "RAZOR_INJECTS"
]);

const inferredRelationshipTypes = new Set([
  "BACKS_TABLE",
  "ROW_IN_TABLE",
  "ROW_HAS_TYPE_CODE",
  "MAPS_DAPPER_RESULT",
  "USES_DAPPER_PARAMETER",
  "PROJECTS_DAPPER_ROW",
  "MAPS_DAPPER_PROPERTY",
  "PROJECTS_MODEL",
  "MAPS_PROPERTY"
]);

const sourceParsedRelationshipTypes = new Set([
  "POSTS_TO",
  "BINDS_MODEL_PROPERTY",
  "WRITES_FIELD",
  "SELECTS_ELEMENT",
  "HANDLES_EVENT",
  "LOADS_SCRIPT",
  "LOADS_STYLE",
  "READS_QUERY_STRING",
  "WRITES_QUERY_STRING",
  "WRITES_BROWSER_HISTORY",
  "CALLS_API_ROUTE",
  "RENDERS_COMPONENT",
  "PASSES_PROP",
  "USES_HOOK",
  "USES_STORE",
  "PROVIDES_CONTEXT",
  "CONSUMES_CONTEXT",
  "IMPORTS_MODULE",
  "TYPE_IMPORTS_MODULE",
  "RE_EXPORTS_MODULE",
  "CALLS",
  "CONTAINS"
]);
