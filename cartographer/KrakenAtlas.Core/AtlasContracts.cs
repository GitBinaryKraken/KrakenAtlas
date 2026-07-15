namespace KrakenAtlas.Core;

public sealed record WorkspaceSnapshot(
    string StableKey,
    string DisplayName,
    IReadOnlyList<string> Roots,
    string SourceFingerprint,
    IReadOnlyList<DiscoveredSolution> Solutions,
    IReadOnlyList<DiscoveredProject> Projects,
    IReadOnlyList<DiscoveredProjectReference> ProjectReferences,
    IReadOnlyList<DiscoveredFile> Files);

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
    int EndColumn);

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
