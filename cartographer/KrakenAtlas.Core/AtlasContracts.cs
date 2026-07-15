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
    AnalyzerExecution AnalyzerRun);

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
    IReadOnlyList<DiscoveredCodeLocation> Locations);

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
    DiscoveredCodeLocation Evidence);

public sealed record AtlasCounts(
    int Solutions,
    int Projects,
    int Files,
    int Entities,
    int Relations,
    int ProjectDependencies);

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
    long DurationMs);

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
