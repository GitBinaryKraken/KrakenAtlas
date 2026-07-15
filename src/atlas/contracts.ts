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

export interface OrientationEvidence {
  relativePath: string;
  line: number;
  provenance: string;
  condition?: string;
}

export interface ProjectFacetDetail {
  stableKey: string;
  facet: string;
  evidence: OrientationEvidence;
}

export interface BuildDimensionDetail {
  stableKey: string;
  kind: string;
  value: string;
  evidence: OrientationEvidence;
}

export interface ProjectOrientation {
  stableKey: string;
  name: string;
  relativePath: string;
  language: string;
  projectKind: string;
  sdk?: string;
  facets: ProjectFacetDetail[];
  buildDimensions: BuildDimensionDetail[];
}

export interface WorkspaceCommandDetail {
  stableKey: string;
  targetKey: string;
  kind: string;
  name: string;
  commandText: string;
  workingDirectory: string;
  evidence: OrientationEvidence;
}

export interface RepositoryRuleDetail {
  stableKey: string;
  category: string;
  name: string;
  value?: string;
  summary: string;
  scope: string;
  authority: string;
  precedence: number;
  evidence: OrientationEvidence;
}

export interface WorkspaceOrientationCoverage {
  status: "partial" | "complete";
  includedSources: string[];
  pendingSources: string[];
}

export interface WorkspaceOrientation {
  atlasState: "not_created" | "requires_rebuild" | "current";
  generation?: number;
  workspaceKey?: string;
  workspaceName?: string;
  roots: string[];
  coverage: WorkspaceOrientationCoverage;
  projects: ProjectOrientation[];
  workspaceBuildDimensions: BuildDimensionDetail[];
  commands: WorkspaceCommandDetail[];
  repositoryRules: RepositoryRuleDetail[];
}
