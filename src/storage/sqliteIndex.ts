import * as fs from "fs/promises";
import * as path from "path";
import { Database } from "sql.js";
import {
  CodeMapIndexRecords,
  FileRecord,
  FindingRecord,
  PatternRecord,
  ReferenceRecord,
  RelationshipRecord,
  SymbolRecord
} from "../model/records";
import { relationshipSourceKind } from "../model/mapProvenance";
import { loadSqlJs } from "./sqlJs";

export async function rebuildSqliteIndex(indexPath: string, records: CodeMapIndexRecords): Promise<void> {
  const SQL = await loadSqlJs();
  const database = new SQL.Database();

  try {
    createSchema(database);
    insertRecords(database, records);

    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.writeFile(indexPath, Buffer.from(database.export()));
  } finally {
    database.close();
  }
}

export async function openSqliteIndex(indexPath: string): Promise<Database> {
  const SQL = await loadSqlJs();
  const databaseBytes = await fs.readFile(indexPath);
  return new SQL.Database(databaseBytes);
}

function createSchema(database: Database): void {
  database.run(`
    CREATE TABLE metadata (
      key TEXT PRIMARY KEY,
      json TEXT NOT NULL
    );

    CREATE TABLE files (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      extension TEXT,
      language TEXT,
      size_bytes INTEGER,
      sha256 TEXT,
      modified_time_utc TEXT,
      is_generated INTEGER DEFAULT 0,
      json TEXT NOT NULL
    );

    CREATE INDEX idx_files_path ON files(path);
    CREATE INDEX idx_files_language ON files(language);

    CREATE TABLE symbols (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      fully_qualified_name TEXT,
      kind TEXT,
      language TEXT,
      file TEXT,
      start_line INTEGER,
      end_line INTEGER,
      summary TEXT,
      json TEXT NOT NULL
    );

    CREATE INDEX idx_symbols_name ON symbols(name);
    CREATE INDEX idx_symbols_fqn ON symbols(fully_qualified_name);
    CREATE INDEX idx_symbols_file ON symbols(file);

    CREATE TABLE references_map (
      id TEXT PRIMARY KEY,
      symbol_name TEXT NOT NULL,
      resolved_symbol_id TEXT,
      file TEXT,
      start_line INTEGER,
      context TEXT,
      snippet TEXT,
      confidence REAL,
      json TEXT NOT NULL
    );

    CREATE INDEX idx_references_symbol_name ON references_map(symbol_name);
    CREATE INDEX idx_references_resolved_symbol ON references_map(resolved_symbol_id);
    CREATE INDEX idx_references_file ON references_map(file);

    CREATE TABLE relationships (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      type TEXT NOT NULL,
      file TEXT,
      start_line INTEGER,
      confidence REAL,
      source_kind TEXT,
      json TEXT NOT NULL
    );

    CREATE INDEX idx_relationships_from ON relationships(from_id);
    CREATE INDEX idx_relationships_to ON relationships(to_id);
    CREATE INDEX idx_relationships_type ON relationships(type);
    CREATE INDEX idx_relationships_file ON relationships(file);
    CREATE INDEX idx_relationships_source_kind ON relationships(source_kind);

    CREATE TABLE patterns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      language TEXT,
      confidence REAL,
      frequency INTEGER,
      counter_example_count INTEGER,
      agent_guidance TEXT,
      json TEXT NOT NULL
    );

    CREATE INDEX idx_patterns_name ON patterns(name);
    CREATE INDEX idx_patterns_category ON patterns(category);
    CREATE INDEX idx_patterns_language ON patterns(language);

    CREATE TABLE findings (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      confidence REAL,
      file TEXT,
      start_line INTEGER,
      fingerprint TEXT,
      json TEXT NOT NULL
    );

    CREATE INDEX idx_findings_kind ON findings(kind);
    CREATE INDEX idx_findings_file ON findings(file);
    CREATE INDEX idx_findings_fingerprint ON findings(fingerprint);

    CREATE TABLE node_projects (
      node_id TEXT NOT NULL,
      project TEXT NOT NULL,
      role TEXT NOT NULL,
      evidence_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (node_id, project, role)
    );

    CREATE INDEX idx_node_projects_node ON node_projects(node_id);
    CREATE INDEX idx_node_projects_project ON node_projects(project);
    CREATE INDEX idx_node_projects_role ON node_projects(role);

    CREATE TABLE node_roles (
      node_id TEXT NOT NULL,
      role TEXT NOT NULL,
      confidence REAL NOT NULL,
      source TEXT NOT NULL,
      PRIMARY KEY (node_id, role, source)
    );

    CREATE INDEX idx_node_roles_node ON node_roles(node_id);
    CREATE INDEX idx_node_roles_role ON node_roles(role);

    CREATE TABLE node_tags (
      node_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence REAL NOT NULL,
      PRIMARY KEY (node_id, tag, source)
    );

    CREATE INDEX idx_node_tags_node ON node_tags(node_id);
    CREATE INDEX idx_node_tags_tag ON node_tags(tag);

    CREATE TABLE node_members (
      node_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      member_name TEXT NOT NULL,
      member_kind TEXT,
      type_name TEXT,
      required INTEGER,
      nullable INTEGER,
      PRIMARY KEY (node_id, member_id)
    );

    CREATE INDEX idx_node_members_node ON node_members(node_id);
    CREATE INDEX idx_node_members_name ON node_members(member_name);

    CREATE TABLE node_usage_summary (
      node_id TEXT PRIMARY KEY,
      incoming_count INTEGER NOT NULL DEFAULT 0,
      outgoing_count INTEGER NOT NULL DEFAULT 0,
      reference_count INTEGER NOT NULL DEFAULT 0,
      project_count INTEGER NOT NULL DEFAULT 0,
      hotspot_score REAL NOT NULL DEFAULT 0,
      edit_likelihood REAL NOT NULL DEFAULT 0,
      avoid_initially INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX idx_node_usage_hotspot ON node_usage_summary(hotspot_score);
    CREATE INDEX idx_node_usage_avoid ON node_usage_summary(avoid_initially);
  `);

  createSearchTable(database);
}

function createSearchTable(database: Database): void {
  try {
    database.run(`
      CREATE VIRTUAL TABLE code_search USING fts5(
        record_id,
        record_type,
        title,
        body,
        path,
        tokenize = 'unicode61'
      );
    `);
  } catch {
    database.run(`
      CREATE TABLE code_search (
        record_id TEXT,
        record_type TEXT,
        title TEXT,
        body TEXT,
        path TEXT
      );
    `);
  }
}

function insertRecords(database: Database, records: CodeMapIndexRecords): void {
  database.run("BEGIN TRANSACTION;");

  try {
    if (records.project) {
      database.run(
        `INSERT INTO metadata (key, json) VALUES (?, ?);`,
        ["project", JSON.stringify(records.project)]
      );
    }

    for (const file of records.files) {
      insertFile(database, file);
    }

    for (const symbol of records.symbols ?? []) {
      insertSymbol(database, symbol);
    }

    for (const reference of records.references ?? []) {
      insertReference(database, reference);
    }

    for (const relationship of records.relationships ?? []) {
      insertRelationship(database, relationship);
    }

    for (const pattern of records.patterns ?? []) {
      insertPattern(database, pattern);
    }

    for (const finding of records.findings ?? []) {
      insertFinding(database, finding);
    }

    insertNodeProjectEnrichment(database, records);
    insertNodeRoleEnrichment(database, records);
    insertNodeTagEnrichment(database, records);
    insertNodeMemberEnrichment(database, records);
    insertNodeUsageSummary(database, records);

    database.run("COMMIT;");
  } catch (error) {
    database.run("ROLLBACK;");
    throw error;
  }
}

function insertFile(database: Database, file: FileRecord): void {
  database.run(
    `INSERT INTO files (id, path, extension, language, size_bytes, sha256, modified_time_utc, is_generated, json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      file.id,
      file.path,
      file.extension,
      file.language,
      file.sizeBytes,
      file.sha256,
      file.modifiedTimeUtc,
      file.isGenerated ? 1 : 0,
      JSON.stringify(file)
    ]
  );

  insertSearchRecord(database, file.id, "file", file.path, [file.language, file.extension, file.tags.join(" ")].join(" "), file.path);
}

function insertSymbol(database: Database, symbol: SymbolRecord): void {
  database.run(
    `INSERT INTO symbols (id, name, fully_qualified_name, kind, language, file, start_line, end_line, summary, json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      symbol.id,
      symbol.name,
      symbol.fullyQualifiedName ?? null,
      symbol.kind,
      symbol.language,
      symbol.file,
      symbol.range.startLine,
      symbol.range.endLine,
      symbol.summary ?? null,
      JSON.stringify(symbol)
    ]
  );

  insertSearchRecord(database, symbol.id, "symbol", symbol.name, [symbol.fullyQualifiedName, symbol.kind, symbol.summary].filter(Boolean).join(" "), symbol.file);
}

function insertReference(database: Database, reference: ReferenceRecord): void {
  database.run(
    `INSERT INTO references_map (id, symbol_name, resolved_symbol_id, file, start_line, context, snippet, confidence, json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      reference.id,
      reference.symbolName,
      reference.resolvedSymbolId ?? null,
      reference.file,
      reference.range.startLine,
      reference.context,
      reference.snippet ?? null,
      reference.confidence,
      JSON.stringify(reference)
    ]
  );

  insertSearchRecord(database, reference.id, "reference", reference.symbolName, [reference.context, reference.snippet].filter(Boolean).join(" "), reference.file);
}

function insertRelationship(database: Database, relationship: RelationshipRecord): void {
  const sourceKind = relationshipSourceKind(relationship);
  const enrichedRelationship = { ...relationship, sourceKind };
  database.run(
    `INSERT INTO relationships (id, from_id, to_id, type, file, start_line, confidence, source_kind, json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      relationship.id,
      relationship.from,
      relationship.to,
      relationship.type,
      relationship.file ?? null,
      relationship.range?.startLine ?? null,
      relationship.confidence,
      sourceKind,
      JSON.stringify(enrichedRelationship)
    ]
  );

  insertSearchRecord(database, relationship.id, "relationship", relationship.type, [relationship.from, relationship.to, relationship.evidence].filter(Boolean).join(" "), relationship.file ?? "");
}

function insertPattern(database: Database, pattern: PatternRecord): void {
  database.run(
    `INSERT INTO patterns (id, name, category, language, confidence, frequency, counter_example_count, agent_guidance, json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      pattern.id,
      pattern.name,
      pattern.category,
      pattern.language ?? null,
      pattern.confidence,
      pattern.frequency,
      pattern.counterExampleCount,
      pattern.agentGuidance,
      JSON.stringify(pattern)
    ]
  );

  insertSearchRecord(database, pattern.id, "pattern", pattern.name, [pattern.category, pattern.language, pattern.rulesObserved.join(" "), pattern.agentGuidance].filter(Boolean).join(" "), "");
}

function insertFinding(database: Database, finding: FindingRecord): void {
  const primary = finding.locations[0];
  database.run(
    `INSERT INTO findings (id, kind, title, confidence, file, start_line, fingerprint, json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      finding.id,
      finding.kind,
      finding.title,
      finding.confidence,
      primary?.file ?? null,
      primary?.range.startLine ?? null,
      finding.fingerprint ?? null,
      JSON.stringify(finding)
    ]
  );

  insertSearchRecord(
    database,
    finding.id,
    "finding",
    finding.title,
    [finding.kind, finding.summary, ...finding.evidence, ...finding.caveats].join(" "),
    primary?.file ?? ""
  );
}

function insertSearchRecord(database: Database, recordId: string, recordType: string, title: string, body: string, filePath: string): void {
  database.run(
    `INSERT INTO code_search (record_id, record_type, title, body, path)
     VALUES (?, ?, ?, ?, ?);`,
    [recordId, recordType, title, body, filePath]
  );
}

function insertNodeProjectEnrichment(database: Database, records: CodeMapIndexRecords): void {
  const counts = new Map<string, number>();
  const knownSymbolIds = new Set((records.symbols ?? []).map((symbol) => symbol.id));
  const add = (nodeId: string | undefined, project: string | undefined, role: "declared" | "referenced" | "related"): void => {
    if (!nodeId || !project) {
      return;
    }
    const key = `${nodeId}\u0000${project}\u0000${role}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };

  for (const file of records.files) {
    add(file.id, inferProjectFromFile(file.path), "declared");
  }

  for (const symbol of records.symbols ?? []) {
    add(symbol.id, inferProjectFromFile(symbol.file), "declared");
  }

  for (const reference of records.references ?? []) {
    for (const nodeId of expandNodeWithKnownParents(reference.resolvedSymbolId ?? undefined, knownSymbolIds)) {
      add(nodeId, inferProjectFromFile(reference.file), "referenced");
    }
  }

  for (const relationship of records.relationships ?? []) {
    const project = inferProjectFromFile(relationship.file ?? "");
    for (const nodeId of expandNodeWithKnownParents(relationship.from, knownSymbolIds)) {
      add(nodeId, project, "related");
    }
    for (const nodeId of expandNodeWithKnownParents(relationship.to, knownSymbolIds)) {
      add(nodeId, project, "related");
    }
  }

  for (const [key, count] of counts) {
    const [nodeId, project, role] = key.split("\u0000");
    database.run(
      `INSERT INTO node_projects (node_id, project, role, evidence_count)
       VALUES (?, ?, ?, ?);`,
      [nodeId, project, role, count]
    );
  }
}

function insertNodeRoleEnrichment(database: Database, records: CodeMapIndexRecords): void {
  const roles = new Map<string, { nodeId: string; role: string; confidence: number; source: string }>();
  const add = (nodeId: string, role: string, confidence: number, source: string): void => {
    const key = `${nodeId}\u0000${role}\u0000${source}`;
    const existing = roles.get(key);
    if (!existing || confidence > existing.confidence) {
      roles.set(key, { nodeId, role, confidence, source });
    }
  };

  for (const file of records.files) {
    for (const role of inferFileRoles(file)) {
      add(file.id, role.role, role.confidence, role.source);
    }
  }

  for (const symbol of records.symbols ?? []) {
    for (const role of inferSymbolRoles(symbol)) {
      add(symbol.id, role.role, role.confidence, role.source);
    }
  }

  const fileIdsByPath = new Map(records.files.map((file) => [normalizeUsagePath(file.path), file.id]));
  for (const relationship of records.relationships ?? []) {
    const fileId = fileIdsByPath.get(normalizeUsagePath(relationship.file ?? ""));
    if (!fileId) {
      continue;
    }

    if (isCSharpProjectionRelationship(relationship)) {
      add(fileId, "model-projector", relationship.type === "PROJECTS_MODEL" ? 0.78 : 0.7, "csharp-projection");
      add(fileId, "model-mapper", 0.74, "csharp-projection");
    }

    if (!isSqlRelationship(relationship)) {
      continue;
    }

    add(fileId, relationship.type === "BACKS_TABLE" ? "generated-table-model" : "data-access", relationship.type === "BACKS_TABLE" ? 0.86 : 0.68, "sql-relationship");
    if (relationship.type === "MAPS_DAPPER_RESULT") {
      add(fileId, "dapper-result-mapper", 0.78, "sql-relationship");
      add(fileId, "data-access", 0.78, "sql-relationship");
    }
    if (relationship.type === "USES_DAPPER_PARAMETER") {
      add(fileId, "dapper-parameter-writer", 0.74, "sql-relationship");
      add(fileId, "data-access", 0.76, "sql-relationship");
    }
    if (relationship.type === "PROJECTS_DAPPER_ROW" || relationship.type === "MAPS_DAPPER_PROPERTY") {
      add(fileId, "dapper-row-projector", relationship.type === "PROJECTS_DAPPER_ROW" ? 0.8 : 0.74, "sql-relationship");
      add(fileId, "data-access", 0.76, "sql-relationship");
    }
    if (relationship.type === "INSERTS_ROW") {
      add(fileId, "seed-source", 0.82, "sql-relationship");
      add(fileId, "definition-source", 0.76, "sql-relationship");
    }
    if (relationship.type === "ROW_HAS_TYPE_CODE") {
      add(fileId, "type-code-editor", 0.72, "sql-relationship");
    }
    if (!isSqlTableRelationship(relationship)) {
      continue;
    }

    const normalizedFile = normalizeRoleText(relationship.file ?? "");
    const table = normalizeRoleText(relationship.to);
    const writesTable = ["WRITES_TABLE", "UPSERTS_TABLE", "DELETES_FROM_TABLE"].includes(relationship.type);
    const readsTable = ["READS_TABLE", "JOINS_TABLE"].includes(relationship.type);
    const adminPath = /\b(admin|admintools|pageadmin|management)\b/u.test(normalizedFile);

    if (adminPath && writesTable) {
      add(fileId, "admin-config-surface", 0.86, "sql-relationship");
      add(fileId, "definition-source", 0.82, "sql-relationship");
    }
    if (isTaxonomyTable(table) && writesTable) {
      add(fileId, "taxonomy-manager", adminPath ? 0.9 : 0.78, "sql-relationship");
      add(fileId, "object-type-manager", table.includes("objecttype") ? 0.9 : 0.75, "sql-relationship");
    }
    if (writesTable && relationshipTouchesTypeCode(relationship)) {
      add(fileId, "type-code-editor", adminPath ? 0.88 : 0.76, "sql-relationship");
      add(fileId, "definition-source", adminPath ? 0.84 : 0.74, "sql-relationship");
    }
    if (isTemplateTable(table)) {
      if (writesTable) {
        add(fileId, "template-admin-surface", 0.88, "sql-relationship");
      }
      if (readsTable) {
        add(fileId, "template-reader", 0.76, "sql-relationship");
        add(fileId, "runtime-template-reader", 0.78, "sql-relationship");
      }
      if (relationship.type === "BACKS_TABLE") {
        add(fileId, "template-table-model", 0.88, "sql-relationship");
      }
    }
  }

  for (const role of roles.values()) {
    database.run(
      `INSERT INTO node_roles (node_id, role, confidence, source)
       VALUES (?, ?, ?, ?);`,
      [role.nodeId, role.role, role.confidence, role.source]
    );
  }
}

function insertNodeTagEnrichment(database: Database, records: CodeMapIndexRecords): void {
  const knownSymbolIds = new Set((records.symbols ?? []).map((symbol) => symbol.id));
  const fileIdsByPath = new Map(records.files.map((file) => [normalizeUsagePath(file.path), file.id]));
  const tags = new Map<string, { nodeId: string; tag: string; source: string; confidence: number }>();
  const add = (nodeId: string | undefined, tag: string, source: string, confidence: number): void => {
    if (!nodeId) {
      return;
    }

    const normalizedTag = normalizeNodeTag(tag);
    if (!normalizedTag) {
      return;
    }

    const key = `${nodeId}\u0000${normalizedTag}\u0000${source}`;
    const existing = tags.get(key);
    if (!existing || confidence > existing.confidence) {
      tags.set(key, { nodeId, tag: normalizedTag, source, confidence });
    }
  };
  const addTags = (nodeId: string | undefined, text: string, source: string, confidence: number): void => {
    for (const tag of inferStableNodeTags(text)) {
      add(nodeId, tag, source, confidence);
    }
  };

  for (const file of records.files) {
    const featurePath = pathWithoutProjectRoot(file.path);
    addTags(file.id, featurePath, "path", 0.72);
    addTags(file.id, file.tags.join(" "), "file-tag", 0.55);
  }

  for (const symbol of records.symbols ?? []) {
    const expandedNodeIds = expandNodeWithKnownParents(symbol.id, knownSymbolIds);
    for (const nodeId of expandedNodeIds) {
      addTags(nodeId, symbol.name, "symbol-name", nodeId === symbol.id ? 0.86 : 0.7);
      addTags(nodeId, symbol.fullyQualifiedName ?? "", "namespace", nodeId === symbol.id ? 0.76 : 0.62);
      addTags(nodeId, pathWithoutProjectRoot(symbol.file), "path", 0.64);
      addTags(nodeId, (symbol.patterns ?? []).join(" "), "pattern", 0.52);
      addTags(nodeId, symbol.summary ?? "", "summary", 0.48);
    }
  }

  for (const reference of records.references ?? []) {
    const text = [
      reference.symbolName,
      reference.context,
      reference.snippet,
      pathWithoutProjectRoot(reference.file)
    ].filter(Boolean).join(" ");
    for (const nodeId of expandNodeWithKnownParents(reference.resolvedSymbolId ?? undefined, knownSymbolIds)) {
      addTags(nodeId, text, "reference", 0.58);
    }

    const fileId = fileIdsByPath.get(normalizeUsagePath(reference.file));
    addTags(fileId, text, "reference-file", 0.46);
  }

  for (const relationship of records.relationships ?? []) {
    const text = [
      relationship.from,
      relationship.to,
      relationship.evidence,
      pathWithoutProjectRoot(relationship.file ?? "")
    ].filter(Boolean).join(" ");
    for (const nodeId of expandNodeWithKnownParents(relationship.from, knownSymbolIds)) {
      addTags(nodeId, text, "relationship", 0.54);
    }
    for (const nodeId of expandNodeWithKnownParents(relationship.to, knownSymbolIds)) {
      addTags(nodeId, text, "relationship", 0.54);
    }

    const fileId = fileIdsByPath.get(normalizeUsagePath(relationship.file ?? ""));
    addTags(fileId, text, "relationship-file", 0.44);
  }

  for (const tag of tags.values()) {
    database.run(
      `INSERT INTO node_tags (node_id, tag, source, confidence)
       VALUES (?, ?, ?, ?);`,
      [tag.nodeId, tag.tag, tag.source, tag.confidence]
    );
  }
}

function insertNodeMemberEnrichment(database: Database, records: CodeMapIndexRecords): void {
  const knownSymbolIds = new Set((records.symbols ?? []).map((symbol) => symbol.id));
  const members = new Map<string, {
    nodeId: string;
    memberId: string;
    memberName: string;
    memberKind: string;
    typeName?: string;
    required?: boolean;
    nullable?: boolean;
  }>();

  for (const symbol of records.symbols ?? []) {
    const kind = symbol.kind.toLowerCase();
    if (kind !== "property" && kind !== "field") {
      continue;
    }

    const parentId = parentSymbolId(symbol.id);
    if (!parentId || !knownSymbolIds.has(parentId)) {
      continue;
    }

    const key = `${parentId}\u0000${symbol.id}`;
    members.set(key, {
      nodeId: parentId,
      memberId: symbol.id,
      memberName: symbol.name,
      memberKind: symbol.kind,
      typeName: inferMemberTypeName(symbol),
      required: inferMemberRequired(symbol),
      nullable: inferMemberNullable(symbol)
    });
  }

  for (const member of members.values()) {
    database.run(
      `INSERT INTO node_members (node_id, member_id, member_name, member_kind, type_name, required, nullable)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        member.nodeId,
        member.memberId,
        member.memberName,
        member.memberKind,
        member.typeName ?? null,
        typeof member.required === "boolean" ? (member.required ? 1 : 0) : null,
        typeof member.nullable === "boolean" ? (member.nullable ? 1 : 0) : null
      ]
    );
  }
}

function insertNodeUsageSummary(database: Database, records: CodeMapIndexRecords): void {
  const knownSymbolIds = new Set((records.symbols ?? []).map((symbol) => symbol.id));
  const fileIdsByPath = new Map(records.files.map((file) => [normalizeUsagePath(file.path), file.id]));
  const summaries = new Map<string, {
    incomingCount: number;
    outgoingCount: number;
    referenceCount: number;
    projects: Set<string>;
    hotspotScore: number;
    editLikelihood: number;
    avoidInitially: boolean;
  }>();
  const fileStats = new Map<string, {
    file: string;
    relationshipCount: number;
    types: Map<string, number>;
    endpoints: Set<string>;
  }>();
  const endpointCounts = new Map<string, number>();

  const ensure = (nodeId: string) => {
    let summary = summaries.get(nodeId);
    if (!summary) {
      summary = {
        incomingCount: 0,
        outgoingCount: 0,
        referenceCount: 0,
        projects: new Set<string>(),
        hotspotScore: 0,
        editLikelihood: 0,
        avoidInitially: false
      };
      summaries.set(nodeId, summary);
    }
    return summary;
  };
  const addProject = (nodeId: string | undefined, project: string | undefined): void => {
    if (nodeId && project) {
      ensure(nodeId).projects.add(project);
    }
  };

  for (const file of records.files) {
    const summary = ensure(file.id);
    addProject(file.id, inferProjectFromFile(file.path));
    summary.editLikelihood = Math.max(summary.editLikelihood, fileUsageEditLikelihood(file.path, 0, false));
  }

  for (const symbol of records.symbols ?? []) {
    ensure(symbol.id);
    addProject(symbol.id, inferProjectFromFile(symbol.file));
  }

  for (const reference of records.references ?? []) {
    for (const nodeId of expandNodeWithKnownParents(reference.resolvedSymbolId ?? undefined, knownSymbolIds)) {
      ensure(nodeId).referenceCount += 1;
      addProject(nodeId, inferProjectFromFile(reference.file));
    }
  }

  for (const relationship of records.relationships ?? []) {
    const project = inferProjectFromFile(relationship.file ?? "");
    for (const nodeId of expandNodeWithKnownParents(relationship.from, knownSymbolIds)) {
      ensure(nodeId).outgoingCount += 1;
      addProject(nodeId, project);
    }
    for (const nodeId of expandNodeWithKnownParents(relationship.to, knownSymbolIds)) {
      ensure(nodeId).incomingCount += 1;
      addProject(nodeId, project);
    }

    const relationshipFile = normalizeUsagePath(relationship.file ?? "");
    const fileId = fileIdsByPath.get(relationshipFile);
    if (fileId) {
      const summary = ensure(fileId);
      summary.outgoingCount += 1;
      addProject(fileId, project);
    }

    if (!relationshipFile || isUsageTestFile(relationshipFile)) {
      continue;
    }

    const stats = fileStats.get(relationshipFile) ?? {
      file: relationshipFile,
      relationshipCount: 0,
      types: new Map<string, number>(),
      endpoints: new Set<string>()
    };
    stats.relationshipCount += 1;
    const type = relationship.type || "UNKNOWN";
    stats.types.set(type, (stats.types.get(type) ?? 0) + 1);
    for (const endpoint of [relationship.from, relationship.to]) {
      if (endpoint && !isCommonUsageExternalSymbol(endpoint)) {
        stats.endpoints.add(endpoint);
        endpointCounts.set(endpoint, (endpointCounts.get(endpoint) ?? 0) + 1);
      }
    }
    fileStats.set(relationshipFile, stats);
  }

  for (const stats of fileStats.values()) {
    const fileId = fileIdsByPath.get(stats.file);
    if (!fileId) {
      continue;
    }

    const relationshipTypes = [...stats.types.keys()];
    const role = inferUsageHotspotRole(stats.file, relationshipTypes);
    const sharedEndpointCount = [...stats.endpoints].filter((endpoint) => (endpointCounts.get(endpoint) ?? 0) > 1).length;
    const hotspotScore = stats.relationshipCount + stats.types.size * 3 + sharedEndpointCount * 2 + usageHotspotRoleScore(role);
    const summary = ensure(fileId);
    summary.hotspotScore = Math.max(summary.hotspotScore, hotspotScore);
    summary.editLikelihood = Math.max(summary.editLikelihood, fileUsageEditLikelihood(stats.file, hotspotScore, false));
    summary.avoidInitially = summary.avoidInitially || role === "composition-root" || role === "configuration" || hotspotScore >= 18;
  }

  for (const [nodeId, summary] of summaries) {
    const relationshipCount = summary.incomingCount + summary.outgoingCount;
    if (!nodeId.startsWith("file:")) {
      summary.hotspotScore = Math.max(
        summary.hotspotScore,
        relationshipCount + summary.referenceCount + Math.max(0, summary.projects.size - 1) * 2
      );
      summary.editLikelihood = Math.max(
        summary.editLikelihood,
        Math.min(1, (relationshipCount + summary.referenceCount) / 20)
      );
      summary.avoidInitially = summary.avoidInitially || summary.projects.size >= 3 || summary.hotspotScore >= 20;
    }

    database.run(
      `INSERT INTO node_usage_summary (node_id, incoming_count, outgoing_count, reference_count, project_count, hotspot_score, edit_likelihood, avoid_initially)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        nodeId,
        summary.incomingCount,
        summary.outgoingCount,
        summary.referenceCount,
        summary.projects.size,
        roundUsageMetric(summary.hotspotScore),
        roundUsageMetric(summary.editLikelihood),
        summary.avoidInitially ? 1 : 0
      ]
    );
  }
}

function inferProjectFromFile(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.?\//, "");
  const firstSegment = normalized.split("/").filter(Boolean)[0];
  return firstSegment && firstSegment !== normalized ? firstSegment : undefined;
}

function inferFileRoles(file: FileRecord): Array<{ role: string; confidence: number; source: string }> {
  const roles: Array<{ role: string; confidence: number; source: string }> = [];
  const filePath = normalizeRoleText(file.path);

  if (file.extension === ".csproj") {
    roles.push({ role: "project", confidence: 1, source: "file-extension" });
  }
  if (/\.(cshtml|razor|html?)$/u.test(file.extension)) {
    roles.push({ role: "view", confidence: 0.8, source: "file-extension" });
  }
  if (/\.(jsx|tsx)$/u.test(file.extension)) {
    roles.push({ role: "react-component", confidence: 0.78, source: "file-extension" });
  }
  if (file.extension === ".ts") {
    roles.push({ role: "typescript-module", confidence: 0.72, source: "file-extension" });
  }
  if (/\bcontrollers?\b/u.test(filePath)) {
    roles.push({ role: "controller", confidence: 0.7, source: "path" });
  }
  if (/\bservices?\b/u.test(filePath)) {
    roles.push({ role: "service", confidence: 0.68, source: "path" });
  }
  if (/\brepositories?\b/u.test(filePath)) {
    roles.push({ role: "repository", confidence: 0.72, source: "path" });
  }

  return roles;
}

function inferSymbolRoles(symbol: SymbolRecord): Array<{ role: string; confidence: number; source: string }> {
  const roles: Array<{ role: string; confidence: number; source: string }> = [];
  const name = symbol.name;
  const kind = symbol.kind.toLowerCase();
  const fqn = symbol.fullyQualifiedName ?? "";
  const filePath = normalizeRoleText(symbol.file);
  const combined = normalizeRoleText([symbol.id, name, fqn, symbol.file, ...(symbol.patterns ?? [])].join(" "));
  const add = (role: string, confidence: number, source: string): void => {
    roles.push({ role, confidence, source });
  };

  if (kind === "project" || symbol.id.startsWith("symbol:dotnet-project:")) {
    add("project", 1, "symbol-kind");
  }
  if (kind === "databasetable" || symbol.id.startsWith("table:")) {
    add("database-table", 0.96, "symbol-kind");
    if (isTemplateTable(combined)) {
      add("template-table", 0.92, "symbol-name");
    }
    if (isTaxonomyTable(combined)) {
      add("taxonomy-table", 0.9, "symbol-name");
    }
  }
  if (kind === "typecodevalue" || symbol.id.startsWith("type-code:")) {
    add("type-code-value", 0.94, "symbol-kind");
  }
  if (kind === "databaserow" || symbol.id.startsWith("row:")) {
    add("database-row", 0.92, "symbol-kind");
    if (symbol.patterns?.includes("seed-row")) {
      add("seed-row", 0.9, "pattern");
    }
  }
  if (/TableDataModel$/u.test(name)) {
    add("generated-table-model", 0.84, "name-suffix");
    if (/Template/u.test(name)) {
      add("template-table-model", 0.84, "name-suffix");
    }
  }
  if (isTypeCodeContract(symbol, combined, filePath)) {
    add("type-code-contract", kind === "enum" ? 0.95 : 0.84, kind === "enum" ? "enum-name" : "symbol-name");
  }
  if (combined.includes("apidomain") || /\b(domain|contracts?)\b/u.test(combined)) {
    add("domain-contract", combined.includes("apidomain") ? 0.95 : 0.82, combined.includes("apidomain") ? "project-name" : "namespace-path");
  }
  if (/\b(viewmodels?|dtos?|models?)\b/u.test(filePath) && /^(class|record|struct|interface)$/u.test(kind)) {
    add("domain-contract", 0.68, "path");
  }
  if (/(?:Request|Command)$/u.test(name)) {
    add("request-dto", 0.92, "name-suffix");
  }
  if (/(?:Response|Result)$/u.test(name)) {
    add("response-dto", 0.9, "name-suffix");
  }
  if (/ViewModel$/u.test(name) || /\bviewmodels?\b/u.test(filePath)) {
    add("view-model", /ViewModel$/u.test(name) ? 0.9 : 0.72, /ViewModel$/u.test(name) ? "name-suffix" : "path");
  }
  if (/(?:Options|Config|Configuration|Settings)$/u.test(name)) {
    add("options", 0.88, "name-suffix");
  }
  if (/\b(entities|datamodels?)\b/u.test(filePath) || /Entity$/u.test(name)) {
    add("entity", /Entity$/u.test(name) ? 0.86 : 0.72, /Entity$/u.test(name) ? "name-suffix" : "path");
  }
  if (kind === "class" && /Controller$/u.test(name)) {
    add("controller", 0.95, "name-suffix");
  } else if (/\bcontrollers?\b/u.test(filePath)) {
    add("controller", 0.72, "path");
  }
  if (/(?:Service|Adapter|Provider|Manager)$/u.test(name)) {
    add("service", 0.84, "name-suffix");
  } else if (/\bservices?\b/u.test(filePath)) {
    add("service", 0.7, "path");
  }
  if (/Repository$/u.test(name) || /\brepositories?\b/u.test(filePath)) {
    add("repository", /Repository$/u.test(name) ? 0.9 : 0.72, /Repository$/u.test(name) ? "name-suffix" : "path");
  }
  if (kind === "view" || symbol.patterns?.includes("web-view")) {
    add("view", 0.9, kind === "view" ? "symbol-kind" : "pattern");
  }
  if (kind === "form" || symbol.patterns?.includes("html-form")) {
    add("form", 0.92, kind === "form" ? "symbol-kind" : "pattern");
  }
  if (kind === "script" || symbol.patterns?.some((pattern) => pattern.includes("js-script"))) {
    add("script", 0.86, kind === "script" ? "symbol-kind" : "pattern");
  }
  if (kind === "eventhandler" || kind === "fieldwriter" || kind === "browserstatereader" || kind === "browserstatewriter") {
    add("js-controller", 0.78, "symbol-kind");
  }
  if (symbol.patterns?.includes("react-component") || kind === "component") {
    add("react-component", 0.92, symbol.patterns?.includes("react-component") ? "pattern" : "symbol-kind");
  }
  if (symbol.patterns?.includes("react-client-component")) {
    add("client-component", 0.9, "pattern");
  }
  if (symbol.patterns?.includes("react-server-component")) {
    add("server-component", 0.86, "pattern");
  }
  if (symbol.patterns?.includes("react-server-action")) {
    add("server-action", 0.9, "pattern");
  }
  if (symbol.patterns?.includes("react-hook") || kind === "hook") {
    add("hook", 0.9, symbol.patterns?.includes("react-hook") ? "pattern" : "symbol-kind");
  }
  if (symbol.patterns?.includes("react-state-store") || kind === "store") {
    add("state-store", 0.92, symbol.patterns?.includes("react-state-store") ? "pattern" : "symbol-kind");
  }
  if (symbol.patterns?.includes("react-context") || kind === "context") {
    add("context-provider", 0.86, symbol.patterns?.includes("react-context") ? "pattern" : "symbol-kind");
  }
  if (symbol.patterns?.includes("client-service") || /\bservices?\b/u.test(filePath) && symbol.language === "typescript") {
    add("client-service", 0.82, symbol.patterns?.includes("client-service") ? "pattern" : "path");
  }
  if (symbol.patterns?.includes("react-route") || kind === "route") {
    add("route", 0.84, symbol.patterns?.includes("react-route") ? "pattern" : "symbol-kind");
  }

  return roles;
}

function normalizeRoleText(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

function isSqlTableRelationship(relationship: RelationshipRecord): boolean {
  return ["READS_TABLE", "JOINS_TABLE", "WRITES_TABLE", "UPSERTS_TABLE", "DELETES_FROM_TABLE", "BACKS_TABLE"].includes(relationship.type)
    && relationship.to.startsWith("table:");
}

function isSqlRelationship(relationship: RelationshipRecord): boolean {
  return isSqlTableRelationship(relationship) || ["INSERTS_ROW", "ROW_IN_TABLE", "ROW_HAS_TYPE_CODE", "MAPS_DAPPER_RESULT", "USES_DAPPER_PARAMETER", "PROJECTS_DAPPER_ROW", "MAPS_DAPPER_PROPERTY"].includes(relationship.type);
}

function isCSharpProjectionRelationship(relationship: RelationshipRecord): boolean {
  return relationship.id.startsWith("relationship:csharp-projection:")
    || relationship.type === "PROJECTS_MODEL";
}

function isTemplateTable(value: string): boolean {
  return /\btemplate|_templates\b/u.test(value);
}

function isTaxonomyTable(value: string): boolean {
  return /\bobject(?:types?|categories?)\b|\btaxonomy\b|\btypecode\b/u.test(value);
}

function relationshipTouchesTypeCode(relationship: RelationshipRecord): boolean {
  return /\btype_?code\b/iu.test([relationship.from, relationship.to, relationship.evidence, relationship.file].filter(Boolean).join(" "));
}

function isTypeCodeContract(symbol: SymbolRecord, combined: string, filePath: string): boolean {
  if (/\btype[-_ ]?code\b/u.test(combined) || /typecode/u.test(combined)) {
    return true;
  }
  return /\btype[-_ ]?codes?\b/u.test(filePath) && /^(enum|class|record|struct|interface|property|field)$/u.test(symbol.kind.toLowerCase());
}

const nodeTagStopWords = new Set([
  "api",
  "app",
  "apps",
  "area",
  "areas",
  "asset",
  "assets",
  "base",
  "bin",
  "bool",
  "boolean",
  "button",
  "class",
  "classes",
  "client",
  "code",
  "connector",
  "context",
  "controller",
  "controllers",
  "csharp",
  "css",
  "data",
  "database",
  "dbcontext",
  "domain",
  "dto",
  "dtos",
  "element",
  "elements",
  "entity",
  "entities",
  "event",
  "events",
  "file",
  "files",
  "form",
  "forms",
  "generated",
  "handler",
  "handlers",
  "html",
  "http",
  "iconfig",
  "iconfiguration",
  "input",
  "inputs",
  "int",
  "interface",
  "javascript",
  "logic",
  "manager",
  "map",
  "maps",
  "method",
  "model",
  "models",
  "module",
  "modules",
  "node",
  "obj",
  "option",
  "options",
  "partial",
  "program",
  "project",
  "property",
  "properties",
  "provider",
  "razor",
  "record",
  "repository",
  "repositories",
  "request",
  "requests",
  "response",
  "responses",
  "result",
  "results",
  "route",
  "routes",
  "script",
  "scripts",
  "service",
  "services",
  "source",
  "static",
  "string",
  "symbol",
  "test",
  "tests",
  "type",
  "types",
  "using",
  "view",
  "views",
  "viewmodel",
  "viewmodels",
  "web",
  "webui",
  "wwwroot"
]);

function inferStableNodeTags(text: string): string[] {
  const words = nodeTagWords(text);
  const tags: string[] = [];

  for (const word of words) {
    tags.push(word);
  }

  for (let index = 0; index < words.length - 1; index += 1) {
    tags.push(`${words[index]}-${words[index + 1]}`);
  }

  for (let index = 0; index < words.length - 2; index += 1) {
    tags.push(`${words[index]}-${words[index + 1]}-${words[index + 2]}`);
  }

  return [...new Set(tags.map(normalizeNodeTag).filter((tag): tag is string => Boolean(tag)))].slice(0, 24);
}

function nodeTagWords(text: string): string[] {
  const expanded = text
    .replace(/\\/g, "/")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
    .replace(/[_:/()[\]{}.,;'"`|+*=<>!?@#$%^&~-]+/gu, " ");

  return [...new Set(expanded
    .split(/\s+/u)
    .map((word) => normalizeNodeTag(word))
    .filter((word): word is string => Boolean(word)))];
}

function normalizeNodeTag(tag: string): string | undefined {
  const normalized = tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  if (normalized.length < 3 || normalized.length > 48) {
    return undefined;
  }
  if (/^\d+$/u.test(normalized)) {
    return undefined;
  }
  if (nodeTagStopWords.has(normalized)) {
    return undefined;
  }

  return normalized;
}

function pathWithoutProjectRoot(filePath: string): string {
  const normalized = normalizeUsagePath(filePath);
  const segments = normalized.split("/").filter(Boolean);
  return segments.length > 1 ? segments.slice(1).join("/") : normalized;
}

function inferMemberTypeName(symbol: SymbolRecord): string | undefined {
  const summary = symbol.summary ?? "";
  const match = summary.match(/\btype\s*[:=]\s*([^;]+)/iu);
  return match?.[1]?.trim();
}

function inferMemberRequired(symbol: SymbolRecord): boolean | undefined {
  const summary = normalizeRoleText(symbol.summary ?? "");
  if (summary.includes("required")) {
    return true;
  }
  if (summary.includes("optional")) {
    return false;
  }
  return undefined;
}

function inferMemberNullable(symbol: SymbolRecord): boolean | undefined {
  const summary = symbol.summary ?? "";
  if (/\?\s*(?:$|[;,{=])/u.test(summary) || /\b(nullable|optional)\b/iu.test(summary)) {
    return true;
  }
  return undefined;
}

function normalizeUsagePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function isUsageTestFile(filePath: string): boolean {
  return /(^|\/)(test|tests|specs?)(\/|$)|(\.|-)(test|spec)\./iu.test(normalizeUsagePath(filePath));
}

function isCommonUsageExternalSymbol(id: string): boolean {
  return /^symbol:csharp:(string|int|long|double|decimal|bool|object|task|task<|ienumerable<|ilist<|list<|dictionary<|datetime|guid|iconfiguration|ihttpclientfactory|ilogger|ilogger<|iserviceprovider|pagemodel|controller|controllerbase)(\.|$|<)/iu.test(id);
}

function inferUsageHotspotRole(filePath: string, relationshipTypes: string[]): string {
  const normalized = normalizeUsagePath(filePath);
  const basename = normalized.split("/").pop() ?? normalized;
  const types = new Set(relationshipTypes);

  if (/^(Program|Startup)\.cs$/iu.test(basename) || types.has("REGISTERS") || types.has("USES_MIDDLEWARE")) {
    return "composition-root";
  }
  if (/appsettings|config|options|settings/iu.test(normalized) || types.has("USES_CONFIG_KEY") || types.has("BINDS_OPTIONS")) {
    return "configuration";
  }
  if (/(Controller|PageModel|\.cshtml\.cs)$/iu.test(basename) || /\.(cshtml|razor)$/iu.test(basename) || types.has("MAPS_ROUTE") || types.has("HANDLES_REQUEST")) {
    return "entry-point";
  }
  if (/(Service|Manager|Repository|Adapter)\.cs$/iu.test(basename) || types.has("CALLS_REPOSITORY") || types.has("USES_DBSET")) {
    return "service-layer";
  }
  if (/\.(js|ts|tsx)$/iu.test(basename) || types.has("HANDLES_EVENT") || types.has("WRITES_QUERY_STRING")) {
    return "client-flow";
  }
  return "shared-bridge";
}

function usageHotspotRoleScore(role: string): number {
  switch (role) {
    case "composition-root":
    case "configuration":
      return 4;
    case "entry-point":
    case "service-layer":
      return 2;
    default:
      return 0;
  }
}

function fileUsageEditLikelihood(filePath: string, hotspotScore: number, avoidInitially: boolean): number {
  const role = inferUsageHotspotRole(filePath, []);
  const roleBase = role === "entry-point" || role === "service-layer" || role === "client-flow" ? 0.55 : role === "shared-bridge" ? 0.35 : 0.15;
  const centralityBoost = Math.min(0.25, hotspotScore / 80);
  const avoidPenalty = avoidInitially || role === "composition-root" || role === "configuration" ? 0.2 : 0;
  return Math.max(0, Math.min(1, roleBase + centralityBoost - avoidPenalty));
}

function roundUsageMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function expandNodeWithKnownParents(nodeId: string | undefined, knownSymbolIds: Set<string>): string[] {
  if (!nodeId) {
    return [];
  }

  const expanded = [nodeId];
  const parent = parentSymbolId(nodeId);
  if (parent && knownSymbolIds.has(parent)) {
    expanded.push(parent);
  }
  return expanded;
}

function parentSymbolId(nodeId: string): string | undefined {
  return parentCSharpSymbolId(nodeId) ?? parentReactSymbolId(nodeId);
}

function parentCSharpSymbolId(nodeId: string): string | undefined {
  const prefix = "symbol:csharp:";
  if (!nodeId.startsWith(prefix)) {
    return undefined;
  }

  const body = nodeId.slice(prefix.length);
  const memberBoundary = body.includes("(")
    ? body.lastIndexOf(".", body.indexOf("("))
    : body.lastIndexOf(".");
  if (memberBoundary <= 0) {
    return undefined;
  }

  return `${prefix}${body.slice(0, memberBoundary)}`;
}

function parentReactSymbolId(nodeId: string): string | undefined {
  const match = /^(symbol:react:.+:(?:props|interface):[^.]+)\.[A-Za-z_$][\w$.-]*$/u.exec(nodeId);
  return match?.[1];
}
