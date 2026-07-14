export interface SourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface FileRecord {
  recordType: "file";
  id: string;
  path: string;
  extension: string;
  language: string;
  sizeBytes: number;
  sha256: string;
  modifiedTimeUtc: string;
  isGenerated: boolean;
  tags: string[];
}

export interface SymbolRecord {
  recordType: "symbol";
  id: string;
  name: string;
  fullyQualifiedName?: string;
  kind: string;
  language: string;
  file: string;
  range: SourceRange;
  modifiers?: string[];
  summary?: string;
  patterns?: string[];
  confidence: number;
}

export interface ReferenceRecord {
  recordType: "reference";
  id: string;
  symbolName: string;
  resolvedSymbolId?: string | null;
  file: string;
  range: SourceRange;
  context: string;
  snippet?: string;
  confidence: number;
}

export interface RelationshipRecord {
  recordType: "relationship";
  id: string;
  from: string;
  to: string;
  type: string;
  file?: string;
  range?: SourceRange;
  evidence?: string;
  confidence: number;
}

export interface CodeMapIndexRecords {
  files: FileRecord[];
  symbols?: SymbolRecord[];
  references?: ReferenceRecord[];
  relationships?: RelationshipRecord[];
  project?: ProjectMetadata;
}

export interface ProjectLanguageSummary {
  language: string;
  fileCount: number;
  primary: boolean;
}

export interface ProjectAnalyzerRun {
  id: string;
  status: "skipped" | "completed" | "failed";
  diagnosticCategory?: "sdk-runtime" | "restore" | "input" | "analyzer-crash" | "unknown";
  diagnosticLabel?: string;
  message?: string;
  detail?: string;
  remediation?: string[];
  recordCounts: {
    symbols: number;
    references: number;
    relationships: number;
  };
}

export interface ProjectMetadata {
  schemaVersion: string;
  generatedAt: string;
  workspaceName: string;
  workspaceRootName: string;
  primaryLanguage: string | null;
  languages: ProjectLanguageSummary[];
  projectTypes: string[];
  analyzerRuns: ProjectAnalyzerRun[];
  recordCounts: {
    files: number;
    symbols: number;
    references: number;
    relationships: number;
  };
  agentGuidance: {
    readFirst: string[];
    queryStrategy: string[];
  };
}

export interface Manifest {
  schemaVersion: string;
  generatedAt: string;
  workspaceName: string;
  workspaceRootName: string;
  generator: {
    name: string;
    version: string;
  };
  outputs: {
    files: string;
    symbols: string;
    references: string;
    relationships: string;
    project: string;
    sqlite: string;
  };
  stats: {
    fileCount: number;
    symbolCount: number;
    relationshipCount: number;
  };
}
