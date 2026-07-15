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
  isGenerated: boolean;
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

export interface SymbolSearchMatch {
  id: number;
  stableKey: string;
  kind: string;
  name: string;
  qualifiedName: string;
  signature: string;
  projectName?: string;
  projectRelativePath?: string;
  definitionCount: number;
  firstDefinition?: EntityLocationDetail;
}

export interface SymbolSearchResult {
  atlasState: "not_created" | "current";
  generation?: number;
  query: string;
  truncated: boolean;
  matches: SymbolSearchMatch[];
}

export interface AtlasEntitySearchMatch {
  id: number;
  stableKey: string;
  kind: string;
  name: string;
  qualifiedName: string;
  language: string;
  signature?: string;
  projectName?: string;
  projectRelativePath?: string;
  firstLocation?: EntityLocationDetail;
}

export interface AtlasEntitySearchResult {
  atlasState: "not_created" | "current";
  generation?: number;
  query: string;
  truncated: boolean;
  matches: AtlasEntitySearchMatch[];
}

export interface CodeUsageTarget {
  id: number;
  stableKey: string;
  kind: string;
  name: string;
  qualifiedName: string;
  signature?: string;
}

export interface CodeUsageMatch {
  sourceId: number;
  sourceStableKey: string;
  sourceKind: string;
  sourceName: string;
  sourceQualifiedName: string;
  sourceSignature?: string;
  relationKind: string;
  dispatchKind?: string;
  projectName?: string;
  projectRelativePath?: string;
  evidence: EntityLocationDetail;
}

export interface CodeUsageResult {
  atlasState: "not_created" | "target_not_found" | "current";
  generation?: number;
  target?: CodeUsageTarget;
  truncated: boolean;
  usages: CodeUsageMatch[];
}

export interface RelationEntity {
  id: number;
  stableKey: string;
  kind: string;
  name: string;
  qualifiedName: string;
  signature?: string;
}

export interface AtlasRelationMatch {
  relationId: number;
  source: RelationEntity;
  target: RelationEntity;
  domain: string;
  kind: string;
  dispatchKind?: string;
  logicalScope?: string;
  projectName?: string;
  projectRelativePath?: string;
  evidence: EntityLocationDetail;
}

export interface RelationQueryResult {
  atlasState: "not_created" | "entity_not_found" | "current";
  generation?: number;
  focus?: RelationEntity;
  direction: "incoming" | "outgoing" | "both";
  truncated: boolean;
  relations: AtlasRelationMatch[];
}

export interface RouteStep {
  ordinal: number;
  relation: AtlasRelationMatch;
}

export interface RouteQueryResult {
  atlasState: "not_created" | "entity_not_found" | "current";
  generation?: number;
  source?: RelationEntity;
  target?: RelationEntity;
  waypoints: RelationEntity[];
  found: boolean;
  graphTruncated: boolean;
  maxDepth: number;
  visitedEntities: number;
  steps: RouteStep[];
}

export interface ChangeSurfaceProject {
  stableKey: string;
  name: string;
  relativePath: string;
  projectKind: string;
  isTest: boolean;
}

export interface ChangeSurfaceItem {
  entity: RelationEntity;
  depth: number;
  pathDirection: "dependency" | "dependent";
  viaRelation: AtlasRelationMatch;
  project?: ChangeSurfaceProject;
}

export interface ChangeSurfaceResult {
  atlasState: "not_created" | "entity_not_found" | "current";
  generation?: number;
  seed?: RelationEntity;
  seedProject?: ChangeSurfaceProject;
  truncated: boolean;
  graphTruncated: boolean;
  maxDepth: number;
  maxEntities: number;
  direct: ChangeSurfaceItem[];
  transitive: ChangeSurfaceItem[];
  relatedTests: ChangeSurfaceItem[];
  affectedProjects: ChangeSurfaceProject[];
  verificationCommands: WorkspaceCommandDetail[];
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
