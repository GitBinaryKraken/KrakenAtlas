import * as fs from "fs/promises";
import * as path from "path";
import { Database } from "sql.js";
import {
  CodeMapIndexRecords,
  FileRecord,
  PatternRecord,
  ReferenceRecord,
  RelationshipRecord,
  SymbolRecord
} from "../model/records";
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
      json TEXT NOT NULL
    );

    CREATE INDEX idx_relationships_from ON relationships(from_id);
    CREATE INDEX idx_relationships_to ON relationships(to_id);
    CREATE INDEX idx_relationships_type ON relationships(type);
    CREATE INDEX idx_relationships_file ON relationships(file);

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
  database.run(
    `INSERT INTO relationships (id, from_id, to_id, type, file, start_line, confidence, json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      relationship.id,
      relationship.from,
      relationship.to,
      relationship.type,
      relationship.file ?? null,
      relationship.range?.startLine ?? null,
      relationship.confidence,
      JSON.stringify(relationship)
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

function insertSearchRecord(database: Database, recordId: string, recordType: string, title: string, body: string, filePath: string): void {
  database.run(
    `INSERT INTO code_search (record_id, record_type, title, body, path)
     VALUES (?, ?, ?, ?, ?);`,
    [recordId, recordType, title, body, filePath]
  );
}
