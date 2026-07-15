export interface AtlasCounts {
  solutions: number;
  projects: number;
  files: number;
  entities: number;
  relations: number;
  projectDependencies: number;
}

export interface ProjectSummary {
  id: number;
  stableKey: string;
  name: string;
  relativePath: string;
  language: string;
  projectKind: string;
  targetFrameworks?: string;
  dependencyCount: number;
}

export interface AnalyzerRunSummary {
  analyzer: string;
  capability: string;
  status: string;
  durationMs: number;
  diagnostic?: string;
}

export interface AtlasSummary {
  atlasState: "not_created" | "current";
  generation?: number;
  workspaceKey?: string;
  workspaceName?: string;
  roots: string[];
  counts: AtlasCounts;
  projects: ProjectSummary[];
  analyzerRuns: AnalyzerRunSummary[];
}

export interface BuildAtlasResult {
  generation: number;
  workspaceKey: string;
  counts: AtlasCounts;
  durationMs: number;
}

export interface EntityLocationDetail {
  fileStableKey: string;
  relativePath: string;
  locationKind: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface EntityDetail {
  id: number;
  stableKey: string;
  kind: string;
  name: string;
  qualifiedName: string;
  language: string;
  signature?: string;
  generation: number;
  incomingRelations: number;
  outgoingRelations: number;
  locations: EntityLocationDetail[];
}
