using System.Text.Json;
using System.Text.Json.Serialization;

namespace KrakenAtlas.Core;

public sealed record WorkspaceSnapshot(
    string StableKey,
    string DisplayName,
    IReadOnlyList<string> Roots,
    string SourceFingerprint,
    IReadOnlyList<DiscoveredSolution> Solutions,
    IReadOnlyList<DiscoveredProject> Projects,
    IReadOnlyList<DiscoveredProjectReference> ProjectReferences,
    IReadOnlyList<DiscoveredFile> Files,
    IReadOnlyList<DiscoveredProjectFacet> ProjectFacets,
    IReadOnlyList<DiscoveredBuildDimension> BuildDimensions,
    IReadOnlyList<DiscoveredWorkspaceCommand> Commands,
    IReadOnlyList<DiscoveredRepositoryRule> RepositoryRules);

public sealed record DiscoveredSolution(
    string StableKey,
    string Name,
    string RootPath,
    string RelativePath,
    string Format);

public sealed record DiscoveredProject(
    string StableKey,
    string Name,
    string RootPath,
    string RelativePath,
    string Language,
    string ProjectKind,
    string? TargetFrameworks,
    string? Sdk);

public sealed record DiscoveredProjectReference(
    string SourceProjectKey,
    string? TargetProjectKey,
    string TargetPath,
    int Line);

public sealed record DiscoveredFile(
    string StableKey,
    string RootPath,
    string RelativePath,
    string? ProjectKey,
    string Language,
    string ContentHash,
    long SizeBytes,
    bool IsGenerated);

public sealed record DiscoveredProjectFacet(
    string StableKey,
    string ProjectKey,
    string Facet,
    string SourceRootPath,
    string SourceRelativePath,
    int Line,
    string Provenance,
    string? Condition);

public sealed record DiscoveredBuildDimension(
    string StableKey,
    string? ProjectKey,
    string Kind,
    string Value,
    string SourceRootPath,
    string SourceRelativePath,
    int Line,
    string Provenance,
    string? Condition);

public sealed record DiscoveredWorkspaceCommand(
    string StableKey,
    string TargetKey,
    string Kind,
    string Name,
    string CommandText,
    string WorkingDirectory,
    string SourceRootPath,
    string SourceRelativePath,
    int Line,
    string Provenance,
    string? Condition);

public sealed record DiscoveredRepositoryRule(
    string StableKey,
    string Category,
    string Name,
    string? Value,
    string Summary,
    string Scope,
    string Authority,
    int Precedence,
    string SourceRootPath,
    string SourceRelativePath,
    int Line,
    string Provenance);

public sealed record CSharpSemanticSnapshot(
    IReadOnlyList<DiscoveredCodeSymbol> Symbols,
    IReadOnlyList<DiscoveredCodeRelation> Relations,
    AnalyzerExecution AnalyzerRun,
    IReadOnlyList<AnalyzedProjectAssembly>? ProjectAssemblies = null);

public sealed record AnalyzedProjectAssembly(
    string ProjectKey,
    string AssemblyName);

public sealed record AnalyzerExecution(
    string Analyzer,
    string AnalyzerVersion,
    string Capability,
    string Status,
    long DurationMs,
    string? Diagnostic);

public sealed record DiscoveredCodeSymbol(
    string StableKey,
    string ProjectKey,
    string Kind,
    string Name,
    string QualifiedName,
    string Signature,
    string Visibility,
    string? ContainingSymbolKey,
    IReadOnlyList<DiscoveredCodeLocation> Locations,
    string Language = "csharp");

public sealed record DiscoveredCodeLocation(
    string SourceRootPath,
    string SourceRelativePath,
    int StartLine,
    int StartColumn,
    int EndLine,
    int EndColumn,
    bool IsGenerated);

public sealed record DiscoveredCodeRelation(
    string SourceEntityKey,
    string TargetSymbolKey,
    string Kind,
    string? DispatchKind,
    DiscoveredCodeLocation Evidence,
    string Domain = "code",
    string? LogicalScope = null);

public sealed record AtlasCounts(
    int Solutions,
    int Projects,
    int Files,
    int Entities,
    int Relations,
    int ProjectDependencies);

public sealed record AtlasIndexingSummary(
    string Mode,
    int ChangedFiles,
    int RemovedFiles,
    int ChangedProjects,
    int AnalyzedProjects,
    int ReusedProjects,
    IReadOnlyList<string> AnalyzedProjectKeys);

public sealed record ProjectSummary(
    long Id,
    string StableKey,
    string Name,
    string RelativePath,
    string Language,
    string ProjectKind,
    string? TargetFrameworks,
    int DependencyCount);

public sealed record AnalyzerRunSummary(
    string Analyzer,
    string Capability,
    string Status,
    long DurationMs,
    string? Diagnostic);

public sealed record AtlasSummary(
    string AtlasState,
    long? Generation,
    string? WorkspaceKey,
    string? WorkspaceName,
    IReadOnlyList<string> Roots,
    AtlasCounts Counts,
    IReadOnlyList<ProjectSummary> Projects,
    IReadOnlyList<AnalyzerRunSummary> AnalyzerRuns)
{
    public static AtlasSummary NotCreated() => new(
        "not_created",
        null,
        null,
        null,
        [],
        new AtlasCounts(0, 0, 0, 0, 0, 0),
        [],
        []);
}

public sealed record BuildAtlasResult(
    long Generation,
    string WorkspaceKey,
    AtlasCounts Counts,
    long DurationMs,
    AtlasIndexingSummary Indexing);

public sealed record IndexedFileState(
    string StableKey,
    string? ProjectKey,
    string RelativePath,
    string ContentHash);

public sealed record SemanticProjectCacheEntry(
    string ProjectKey,
    string InputFingerprint,
    string? AssemblyName,
    IReadOnlyList<DiscoveredCodeSymbol> Symbols,
    IReadOnlyList<DiscoveredCodeRelation> Relations);

public sealed record AtlasIndexState(
    long Generation,
    string SourceFingerprint,
    string SemanticStatus,
    AtlasCounts Counts,
    IReadOnlyList<IndexedFileState> Files,
    IReadOnlyList<SemanticProjectCacheEntry> SemanticProjects);

public sealed record EntityLocationDetail(
    string FileStableKey,
    string RelativePath,
    string LocationKind,
    int StartLine,
    int StartColumn,
    int EndLine,
    int EndColumn,
    bool IsGenerated);

public sealed record EntityDetail(
    long Id,
    string StableKey,
    string Kind,
    string Name,
    string QualifiedName,
    string Language,
    string? Signature,
    long Generation,
    int IncomingRelations,
    int OutgoingRelations,
    IReadOnlyList<EntityLocationDetail> Locations);

public sealed record SymbolSearchMatch(
    long Id,
    string StableKey,
    string Kind,
    string Name,
    string QualifiedName,
    string Signature,
    string? ProjectName,
    string? ProjectRelativePath,
    int DefinitionCount,
    EntityLocationDetail? FirstDefinition);

public sealed record SymbolSearchResult(
    string AtlasState,
    long? Generation,
    string Query,
    bool Truncated,
    IReadOnlyList<SymbolSearchMatch> Matches)
{
    public static SymbolSearchResult NotCreated(string query) => new(
        "not_created",
        null,
        query,
        false,
        []);
}

public sealed record AtlasEntitySearchMatch(
    long Id,
    string StableKey,
    string Kind,
    string Name,
    string QualifiedName,
    string Language,
    string? Signature,
    string? ProjectName,
    string? ProjectRelativePath,
    EntityLocationDetail? FirstLocation);

public sealed record AtlasEntitySearchResult(
    string AtlasState,
    long? Generation,
    string Query,
    bool Truncated,
    IReadOnlyList<AtlasEntitySearchMatch> Matches)
{
    public static AtlasEntitySearchResult NotCreated(string query) => new(
        "not_created", null, query, false, []);
}

public sealed record CodeUsageTarget(
    long Id,
    string StableKey,
    string Kind,
    string Name,
    string QualifiedName,
    string? Signature);

public sealed record CodeUsageMatch(
    long SourceId,
    string SourceStableKey,
    string SourceKind,
    string SourceName,
    string SourceQualifiedName,
    string? SourceSignature,
    string RelationKind,
    string? DispatchKind,
    string? ProjectName,
    string? ProjectRelativePath,
    EntityLocationDetail Evidence);

public sealed record CodeUsageResult(
    string AtlasState,
    long? Generation,
    CodeUsageTarget? Target,
    bool Truncated,
    IReadOnlyList<CodeUsageMatch> Usages)
{
    public static CodeUsageResult NotCreated() => new("not_created", null, null, false, []);

    public static CodeUsageResult TargetNotFound(long generation) =>
        new("target_not_found", generation, null, false, []);
}

public sealed record RelationEntity(
    long Id,
    string StableKey,
    string Kind,
    string Name,
    string QualifiedName,
    string? Signature);

public sealed record AtlasRelationMatch(
    long RelationId,
    RelationEntity Source,
    RelationEntity Target,
    string Domain,
    string Kind,
    string? DispatchKind,
    string? LogicalScope,
    string? ProjectName,
    string? ProjectRelativePath,
    EntityLocationDetail Evidence);

public sealed record RelationQueryResult(
    string AtlasState,
    long? Generation,
    RelationEntity? Focus,
    string Direction,
    bool Truncated,
    IReadOnlyList<AtlasRelationMatch> Relations)
{
    public static RelationQueryResult NotCreated(string direction) =>
        new("not_created", null, null, direction, false, []);

    public static RelationQueryResult EntityNotFound(long generation, string direction) =>
        new("entity_not_found", generation, null, direction, false, []);
}

public sealed record RouteStep(int Ordinal, AtlasRelationMatch Relation);

public sealed record RouteQueryResult(
    string AtlasState,
    long? Generation,
    RelationEntity? Source,
    RelationEntity? Target,
    IReadOnlyList<RelationEntity> Waypoints,
    bool Found,
    bool GraphTruncated,
    int MaxDepth,
    int VisitedEntities,
    IReadOnlyList<RouteStep> Steps)
{
    public static RouteQueryResult NotCreated(int maxDepth) =>
        new("not_created", null, null, null, [], false, false, maxDepth, 0, []);

    public static RouteQueryResult EntityNotFound(
        long generation,
        RelationEntity? source,
        RelationEntity? target,
        int maxDepth) =>
        new("entity_not_found", generation, source, target, [], false, false, maxDepth, 0, []);
}

public sealed record ChangeSurfaceProject(
    string StableKey,
    string Name,
    string RelativePath,
    string ProjectKind,
    bool IsTest);

public sealed record ChangeSurfaceItem(
    RelationEntity Entity,
    int Depth,
    string PathDirection,
    AtlasRelationMatch ViaRelation,
    ChangeSurfaceProject? Project);

public sealed record ChangeSurfaceResult(
    string AtlasState,
    long? Generation,
    RelationEntity? Seed,
    ChangeSurfaceProject? SeedProject,
    bool Truncated,
    bool GraphTruncated,
    int MaxDepth,
    int MaxEntities,
    IReadOnlyList<ChangeSurfaceItem> Direct,
    IReadOnlyList<ChangeSurfaceItem> Transitive,
    IReadOnlyList<ChangeSurfaceItem> RelatedTests,
    IReadOnlyList<ChangeSurfaceProject> AffectedProjects,
    IReadOnlyList<WorkspaceCommandDetail> VerificationCommands)
{
    public static ChangeSurfaceResult NotCreated(int maxDepth, int maxEntities) => new(
        "not_created", null, null, null, false, false, maxDepth, maxEntities, [], [], [], [], []);

    public static ChangeSurfaceResult EntityNotFound(
        long generation,
        int maxDepth,
        int maxEntities) => new(
            "entity_not_found", generation, null, null, false, false, maxDepth, maxEntities,
            [], [], [], [], []);
}

public sealed record GitFileDelta(
    string RepositoryRoot,
    string Status,
    string Path,
    string? OldPath);

public sealed record GitChangedFileProjection(
    string Status,
    string Path,
    string? OldPath,
    string? FileStableKey,
    ChangeSurfaceProject? Project,
    bool EntitiesTruncated,
    IReadOnlyList<RelationEntity> Entities);

public sealed record GitRepositoryProjection(
    string RepositoryRoot,
    string? Branch,
    string Head,
    bool Dirty,
    bool ChangesTruncated,
    IReadOnlyList<GitChangedFileProjection> ChangedFiles);

public sealed record GitProjectedImpact(
    RelationEntity Entity,
    string ChangedEntityStableKey,
    int Depth,
    string PathDirection,
    string RelationDomain,
    string RelationKind,
    ChangeSurfaceProject? Project);

public sealed record GitAssessmentRisk(
    string ClaimId,
    AssessmentSubject Subject,
    string Status,
    string Statement,
    IReadOnlyList<GitAssessmentRiskDependency> Dependencies);

public sealed record GitAssessmentRiskDependency(
    string Kind,
    string StableKey);

public sealed record GitChangeMap(
    string AtlasState,
    long? Generation,
    bool Truncated,
    IReadOnlyList<GitChangedFileProjection> ChangedFiles,
    IReadOnlyList<GitAssessmentRisk> AssessmentRisks)
{
    public static GitChangeMap NotCreated() => new("not_created", null, false, [], []);
}

public sealed record GitChangeProjectionResult(
    string AtlasState,
    long? Generation,
    string Mode,
    string? BaseRef,
    string? TargetRef,
    bool Truncated,
    IReadOnlyList<GitRepositoryProjection> Repositories,
    IReadOnlyList<GitProjectedImpact> Impacts,
    IReadOnlyList<ChangeSurfaceItem> RelatedTests,
    IReadOnlyList<ChangeSurfaceProject> AffectedProjects,
    IReadOnlyList<GitAssessmentRisk> AssessmentsAtRisk,
    IReadOnlyList<WorkspaceCommandDetail> VerificationCommands)
{
    public static GitChangeProjectionResult NotCreated(
        string mode,
        string? baseRef,
        string? targetRef,
        IReadOnlyList<GitRepositoryProjection> repositories) => new(
            "not_created", null, mode, baseRef, targetRef, false, repositories,
            [], [], [], [], []);
}

public sealed record AssessmentSubject(
    string StableKey,
    string Kind,
    string QualifiedName,
    long? CurrentEntityId);

public sealed record AssessmentEvidenceDetail(
    string Kind,
    string Summary);

public sealed record AgentAssessmentDetail(
    string ClaimId,
    string SessionId,
    string ClientUpdateId,
    AssessmentSubject Subject,
    string UpdateKind,
    string Dimension,
    string Statement,
    JsonElement Update,
    JsonElement? Conditions,
    double Confidence,
    string Status,
    string Freshness,
    IReadOnlyList<string> StaleReasons,
    long ValidatedGeneration,
    long LastCheckedGeneration,
    string AgentName,
    string? AgentModel,
    string? AgentClient,
    IReadOnlyList<string> Tags,
    IReadOnlyList<AssessmentEvidenceDetail> Evidence,
    DateTimeOffset CreatedUtc,
    DateTimeOffset UpdatedUtc);

public sealed record AssessmentQueryResult(
    string AtlasState,
    long? Generation,
    RelationEntity? Focus,
    bool Truncated,
    IReadOnlyList<AgentAssessmentDetail> Assessments)
{
    public static AssessmentQueryResult NotCreated() =>
        new("not_created", null, null, false, []);

    public static AssessmentQueryResult EntityNotFound(long generation) =>
        new("entity_not_found", generation, null, false, []);
}

public sealed record DecorationDiagnostic(
    string Code,
    string Path,
    string Message);

public sealed record DecorationResultItem(
    string ClientUpdateId,
    string UpdateKind,
    long SubjectEntityId,
    string Status,
    IReadOnlyList<string> ClaimIds,
    string? GroupKey,
    int EvidenceCount,
    int DependencyCount);

public sealed record DecorateNodesResult(
    string SchemaVersion,
    string OperationId,
    string WorkspaceKey,
    long AtlasGeneration,
    string SessionId,
    string Status,
    IReadOnlyList<DecorationResultItem> Results,
    IReadOnlyList<DecorationDiagnostic> Diagnostics);

public sealed record DecorationWorkspace(
    string WorkspaceKey,
    long ExpectedAtlasGeneration);

public sealed record DecorationAgent(
    string Name,
    string? Model,
    string? Client,
    string? ClientVersion);

public sealed record DecorationSession(
    string? SessionId,
    DecorationAgent Agent,
    string Purpose,
    string? TaskFingerprint,
    JsonElement? Scope);

public sealed record DecorationOptions(
    bool? Atomic,
    bool? DryRun,
    bool? CompleteSession,
    string? ConflictPolicy,
    string? MissingSubjectPolicy);

public sealed record NodeSelector(
    string? StableKey,
    long? EntityId,
    string? ExpectedKind,
    string? ExpectedQualifiedName);

public sealed record NodeDecoration(
    string ClientUpdateId,
    NodeSelector Subject,
    JsonElement Update,
    string Statement,
    double Confidence,
    string RequestedStatus,
    JsonElement? Conditions,
    string DependencyPolicy,
    IReadOnlyList<JsonElement> Evidence,
    IReadOnlyList<JsonElement>? Dependencies,
    IReadOnlyList<string>? SupersedesClaimIds,
    IReadOnlyList<string>? Tags);

public sealed record NodeDecorationBatch(
    [property: JsonPropertyName("$schema")] string Schema,
    string SchemaVersion,
    string OperationId,
    DecorationWorkspace Workspace,
    DecorationSession Session,
    DecorationOptions? Options,
    IReadOnlyList<NodeDecoration> Decorations);

public sealed record PreparedChangeItem(
    RelationEntity Entity,
    string Relevance,
    int Score,
    int Depth,
    string? PathDirection,
    string? RelationDomain,
    string? RelationKind,
    ChangeSurfaceProject? Project,
    EntityLocationDetail? Evidence,
    PreparedSourceSlice? Source = null);

public sealed record PreparedSourceSlice(
    string RelativePath,
    int StartLine,
    int EndLine,
    string Language,
    string Content,
    bool Truncated);

public sealed record PreparedChangeResult(
    string AtlasState,
    long? Generation,
    string Task,
    int TokenBudget,
    int EstimatedTokens,
    bool Truncated,
    bool SurfaceTruncated,
    bool GraphTruncated,
    RelationEntity? Seed,
    ChangeSurfaceProject? SeedProject,
    IReadOnlyList<string> AgentInstructions,
    IReadOnlyList<PreparedChangeItem> Items,
    IReadOnlyList<AgentAssessmentDetail> Assessments,
    IReadOnlyList<ChangeSurfaceProject> AffectedProjects,
    IReadOnlyList<WorkspaceCommandDetail> VerificationCommands,
    int OmittedItems,
    int OmittedAssessments,
    int SourceSlicesIncluded = 0,
    int OmittedSourceSlices = 0)
{
    public static PreparedChangeResult NotCreated(string task, int tokenBudget) => new(
        "not_created", null, task, tokenBudget, 0, false, false, false, null, null,
        [], [], [], [], [], 0, 0);

    public static PreparedChangeResult EntityNotFound(
        long generation,
        string task,
        int tokenBudget) => new(
            "entity_not_found", generation, task, tokenBudget, 0, false, false, false,
            null, null, [], [], [], [], [], 0, 0);
}

public sealed record TaskSeedCandidate(
    AtlasEntitySearchMatch Entity,
    int Score,
    IReadOnlyList<string> MatchedTerms,
    bool ExactNameMatch);

public sealed record TaskContextResult(
    string AtlasState,
    long? Generation,
    string Task,
    string Resolution,
    IReadOnlyList<string> QueryTerms,
    IReadOnlyList<TaskSeedCandidate> Candidates,
    PreparedChangeResult? ContextPack)
{
    public static TaskContextResult NotCreated(string task) => new(
        "not_created", null, task, "not_created", [], [], null);
}

public sealed record OrientationEvidence(
    string RelativePath,
    int Line,
    string Provenance,
    string? Condition);

public sealed record ProjectFacetDetail(
    string StableKey,
    string Facet,
    OrientationEvidence Evidence);

public sealed record BuildDimensionDetail(
    string StableKey,
    string Kind,
    string Value,
    OrientationEvidence Evidence);

public sealed record ProjectOrientation(
    string StableKey,
    string Name,
    string RelativePath,
    string Language,
    string ProjectKind,
    string? Sdk,
    IReadOnlyList<ProjectFacetDetail> Facets,
    IReadOnlyList<BuildDimensionDetail> BuildDimensions);

public sealed record WorkspaceCommandDetail(
    string StableKey,
    string TargetKey,
    string Kind,
    string Name,
    string CommandText,
    string WorkingDirectory,
    OrientationEvidence Evidence);

public sealed record RepositoryRuleDetail(
    string StableKey,
    string Category,
    string Name,
    string? Value,
    string Summary,
    string Scope,
    string Authority,
    int Precedence,
    OrientationEvidence Evidence);

public sealed record WorkspaceOrientationCoverage(
    string Status,
    IReadOnlyList<string> IncludedSources,
    IReadOnlyList<string> PendingSources);

public sealed record WorkspaceOrientation(
    string AtlasState,
    long? Generation,
    string? WorkspaceKey,
    string? WorkspaceName,
    IReadOnlyList<string> Roots,
    WorkspaceOrientationCoverage Coverage,
    IReadOnlyList<ProjectOrientation> Projects,
    IReadOnlyList<BuildDimensionDetail> WorkspaceBuildDimensions,
    IReadOnlyList<WorkspaceCommandDetail> Commands,
    IReadOnlyList<RepositoryRuleDetail> RepositoryRules)
{
    public static WorkspaceOrientation NotCreated() => new(
        "not_created",
        null,
        null,
        null,
        [],
        CurrentCoverage(),
        [],
        [],
        [],
        []);

    public static WorkspaceOrientation RequiresRebuild(
        long generation,
        string workspaceKey,
        string workspaceName,
        IReadOnlyList<string> roots) => new(
        "requires_rebuild",
        generation,
        workspaceKey,
        workspaceName,
        roots,
        CurrentCoverage(),
        [],
        [],
        [],
        []);

    public static WorkspaceOrientationCoverage CurrentCoverage() => new(
        "partial",
        [
            "dotnet_projects",
            "package_json_projects",
            "msbuild_dimensions",
            "derived_dotnet_commands",
            "package_scripts",
            "hosted_service_registrations",
            "global_json",
            "editorconfig",
            "directory_build",
            "instruction_references"
        ],
        [
            "ci_workflows",
            "vscode_tasks",
            "executable_entry_points",
            "conditional_source_inclusion",
            "prose_instruction_bodies"
        ]);
}
