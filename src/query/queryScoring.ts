import { stringValue } from "./queryUtils";

export function strongAnchorRoleBoost(row: Record<string, unknown>): number {
  const file = stringValue(row.file).replace(/\\/g, "/").toLowerCase();
  const kind = stringValue(row.kind).toLowerCase();

  if (kind === "method" && file.includes("/controllers/")) {
    return 9;
  }
  if (kind === "method" && (file.includes("/services/") || file.includes("/repositories/"))) {
    return 5;
  }
  if (kind === "interface" || /\/(service|data|repository)definitions\//.test(file)) {
    return -2;
  }
  if (file.includes("/viewmodels/") || file.includes("/models/")) {
    return -1;
  }

  return 0;
}

export function relationshipWeight(type: string): number {
  const weights: Record<string, number> = {
    READS_QUERY_STRING: 6,
    WRITES_QUERY_STRING: 7,
    WRITES_BROWSER_HISTORY: 5,
    MAPS_ROUTE: 5,
    POSTS_TO: 5,
    CALLS: 4,
    INJECTS: 4,
    REGISTERS: 4,
    IMPLEMENTS: 3,
    USES_DBSET: 3,
    QUERIES: 4,
    WRITES: 5,
    READS_TABLE: 4,
    JOINS_TABLE: 3,
    WRITES_TABLE: 5,
    UPSERTS_TABLE: 6,
    DELETES_FROM_TABLE: 5,
    BACKS_TABLE: 3,
    MAPS_DAPPER_RESULT: 4,
    USES_DAPPER_PARAMETER: 4,
    PROJECTS_DAPPER_ROW: 4,
    MAPS_DAPPER_PROPERTY: 4,
    PROJECTS_MODEL: 4,
    HAS_TYPE_CODE_MEMBER: 3,
    DEFINES_TYPE_CODE: 4,
    INSERTS_ROW: 4,
    ROW_IN_TABLE: 3,
    ROW_HAS_TYPE_CODE: 4,
    CALLS_REPOSITORY: 4,
    VALIDATES: 5,
    USES_VALIDATOR: 4,
    REQUIRES_AUTH: 5,
    HANDLES_REQUEST: 5,
    RUNS_HOSTED_SERVICE: 5,
    USES_MIDDLEWARE: 4,
    DBSET_FOR: 3,
    BINDS_OPTIONS: 3,
    USES_OPTIONS: 3,
    USES_CONFIG_KEY: 2,
    PROJECT_REFERENCES: 3,
    HANDLES_EVENT: 3,
    EMITS_EVENT: 5,
    SUBSCRIBES_EVENT: 5,
    UPDATES_ELEMENT_STATE: 4,
    SELECTS_ELEMENT: 2,
    WRITES_FIELD: 4,
    BINDS_MODEL_PROPERTY: 4,
    MAPS_PROPERTY: 5,
    LOADS_SCRIPT: 2,
    CONTAINS: 1
  };
  return weights[type] ?? 1;
}
