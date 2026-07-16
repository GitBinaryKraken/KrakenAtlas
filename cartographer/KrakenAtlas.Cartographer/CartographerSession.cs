using System.Diagnostics;
using KrakenAtlas.Analyzers.Roslyn;
using KrakenAtlas.Core;
using KrakenAtlas.Protocol;
using KrakenAtlas.Storage.Sqlite;
using KrakenAtlas.Workspace;

namespace KrakenAtlas.Cartographer;

internal sealed partial class CartographerSession
{
    private readonly WorkspaceDiscovery discovery = new();
    private readonly CSharpDeclarationAnalyzer csharpDeclarationAnalyzer = new();
    private AtlasRepository? repository;
    private IReadOnlyList<string> workspaceRoots = [];
    private string? workspaceKey;

    public bool IsInitialized => repository is not null;

    public async Task InitializeAsync(InitializeParams parameters, CancellationToken cancellationToken)
    {
        if (parameters.ProtocolVersion != "1.0")
        {
            throw new InvalidOperationException(
                $"Protocol version {parameters.ProtocolVersion} is not supported. Expected 1.0.");
        }
        if (string.IsNullOrWhiteSpace(parameters.AtlasPath))
        {
            throw new ArgumentException("Initialization requires an Atlas path.", nameof(parameters));
        }

        workspaceRoots = WorkspaceIdentity.NormalizeRoots(parameters.WorkspaceRoots);
        workspaceKey = workspaceRoots.Count == 0 ? null : WorkspaceIdentity.CreateStableKey(workspaceRoots);
        repository = new AtlasRepository(Path.GetFullPath(parameters.AtlasPath));
        await repository.InitializeAsync(cancellationToken);
    }

    public async Task<FoundationStatus> GetFoundationStatusAsync(CancellationToken cancellationToken)
    {
        var summary = await GetAtlasSummaryAsync(cancellationToken);
        return FoundationStatus.Create(summary);
    }

    public async Task<BuildAtlasResult> BuildAtlasAsync(CancellationToken cancellationToken)
    {
        var stopwatch = Stopwatch.StartNew();
        var activeRepository = RequireRepository();
        if (workspaceRoots.Count == 0)
        {
            throw new InvalidOperationException("Atlas build requires at least one workspace root.");
        }

        var snapshot = await discovery.DiscoverAsync(workspaceRoots, cancellationToken);
        workspaceKey = snapshot.StableKey;
        var current = await activeRepository.GetIndexStateAsync(
            snapshot.StableKey,
            CSharpDeclarationAnalyzer.AnalyzerName,
            CSharpDeclarationAnalyzer.AnalyzerVersion,
            cancellationToken);
        var csharpProjectCount = snapshot.Projects.Count(project =>
            project.Language == "csharp"
            && project.RelativePath.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase));
        if (current is not null
            && current.SourceFingerprint == snapshot.SourceFingerprint
            && current.SemanticStatus != "failed"
            && current.SemanticProjects.Count == csharpProjectCount)
        {
            stopwatch.Stop();
            return new BuildAtlasResult(
                current.Generation,
                snapshot.StableKey,
                current.Counts,
                stopwatch.ElapsedMilliseconds,
                new AtlasIndexingSummary("unchanged", 0, 0, 0, 0, current.SemanticProjects.Count, []));
        }

        var indexed = await BuildSemanticSnapshotAsync(snapshot, current, cancellationToken);
        var result = await activeRepository.BuildAsync(
            snapshot,
            indexed.Snapshot,
            indexed.CacheEntries,
            indexed.Indexing,
            cancellationToken);
        stopwatch.Stop();
        return result with { DurationMs = stopwatch.ElapsedMilliseconds };
    }

    public async Task<AtlasSummary> GetAtlasSummaryAsync(CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        if (workspaceKey is null)
        {
            return AtlasSummary.NotCreated();
        }
        var summary = await activeRepository.GetSummaryAsync(workspaceKey, cancellationToken);
        return AnalyzerRunsAreCurrent(summary)
            ? summary
            : summary with { AtlasState = "requires_rebuild" };
    }

    public async Task<WorkspaceOrientation> GetWorkspaceOrientationAsync(CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        if (workspaceKey is null)
        {
            return WorkspaceOrientation.NotCreated();
        }
        var orientation = await activeRepository.GetWorkspaceOrientationAsync(workspaceKey, cancellationToken);
        var summary = await activeRepository.GetSummaryAsync(workspaceKey, cancellationToken);
        return AnalyzerRunsAreCurrent(summary)
            ? orientation
            : orientation with { AtlasState = "requires_rebuild" };
    }

    public Task<EntityDetail?> GetEntityAsync(
        GetEntityParams parameters,
        CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        if (workspaceKey is null)
        {
            return Task.FromResult<EntityDetail?>(null);
        }
        return activeRepository.GetEntityAsync(
            workspaceKey,
            parameters.StableKey,
            parameters.Id,
            cancellationToken);
    }

    public Task<SymbolSearchResult> SearchSymbolsAsync(
        SearchSymbolsParams parameters,
        CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        if (workspaceKey is null)
        {
            return Task.FromResult(SymbolSearchResult.NotCreated(parameters.Query));
        }
        return activeRepository.SearchSymbolsAsync(
            workspaceKey,
            parameters.Query,
            parameters.Limit ?? 25,
            cancellationToken);
    }

    public Task<AtlasEntitySearchResult> SearchEntitiesAsync(
        SearchEntitiesParams parameters,
        CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        if (workspaceKey is null)
        {
            return Task.FromResult(AtlasEntitySearchResult.NotCreated(parameters.Query));
        }
        return activeRepository.SearchEntitiesAsync(
            workspaceKey,
            parameters.Query,
            parameters.Kinds,
            parameters.Limit ?? 25,
            cancellationToken);
    }

    public Task<CodeUsageResult> FindUsagesAsync(
        FindUsagesParams parameters,
        CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        if (workspaceKey is null)
        {
            return Task.FromResult(CodeUsageResult.NotCreated());
        }
        return activeRepository.FindCodeUsagesAsync(
            workspaceKey,
            parameters.StableKey,
            parameters.Id,
            parameters.Kinds,
            parameters.Limit ?? 50,
            cancellationToken);
    }

    public Task<RelationQueryResult> GetRelationsAsync(
        GetRelationsParams parameters,
        CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        if (workspaceKey is null)
        {
            return Task.FromResult(RelationQueryResult.NotCreated(parameters.Direction ?? "both"));
        }
        return activeRepository.GetRelationsAsync(
            workspaceKey,
            parameters.StableKey,
            parameters.Id,
            parameters.Direction ?? "both",
            parameters.Domains,
            parameters.Kinds,
            parameters.Limit ?? 50,
            cancellationToken);
    }

    public Task<RouteQueryResult> TraceRouteAsync(
        TraceRouteParams parameters,
        CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        if (workspaceKey is null)
        {
            return Task.FromResult(RouteQueryResult.NotCreated(parameters.MaxDepth ?? 8));
        }
        return activeRepository.TraceRouteAsync(
            workspaceKey,
            parameters.SourceStableKey,
            parameters.SourceId,
            parameters.TargetStableKey,
            parameters.TargetId,
            parameters.ViaStableKeys,
            parameters.Domains,
            parameters.Kinds,
            parameters.MaxDepth ?? 8,
            parameters.MaxVisited ?? 5000,
            cancellationToken);
    }

    public Task<ChangeSurfaceResult> GetChangeSurfaceAsync(
        GetChangeSurfaceParams parameters,
        CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        if (workspaceKey is null)
        {
            return Task.FromResult(ChangeSurfaceResult.NotCreated(
                parameters.MaxDepth ?? 3,
                parameters.MaxEntities ?? 200));
        }
        return activeRepository.GetChangeSurfaceAsync(
            workspaceKey,
            parameters.StableKey,
            parameters.Id,
            parameters.Domains,
            parameters.Kinds,
            parameters.MaxDepth ?? 3,
            parameters.MaxEntities ?? 200,
            cancellationToken);
    }

    public Task<AssessmentQueryResult> GetAssessmentsAsync(
        GetAssessmentsParams parameters,
        CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        if (workspaceKey is null)
        {
            return Task.FromResult(AssessmentQueryResult.NotCreated());
        }
        return activeRepository.GetAssessmentsAsync(
            workspaceKey,
            parameters.StableKey,
            parameters.Id,
            parameters.IncludeProposed ?? false,
            parameters.IncludeStale ?? false,
            parameters.IncludeHistory ?? false,
            parameters.Limit ?? 50,
            cancellationToken);
    }

    public Task<DecorateNodesResult> DecorateNodesAsync(
        NodeDecorationBatch batch,
        bool forceDryRun,
        CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        if (workspaceKey is null)
        {
            throw new InvalidOperationException("Node decoration requires an initialized workspace.");
        }
        return activeRepository.DecorateNodesAsync(
            workspaceKey, batch, forceDryRun, cancellationToken);
    }

    public Task<PreparedChangeResult> PrepareChangeAsync(
        PrepareChangeParams parameters,
        CancellationToken cancellationToken) => PrepareChangeCoreAsync(
            parameters,
            ExtractTaskTerms(null, parameters.Task),
            cancellationToken);

    private async Task<PreparedChangeResult> PrepareChangeCoreAsync(
        PrepareChangeParams parameters,
        IReadOnlyList<string> focusTerms,
        CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        var tokenBudget = parameters.TokenBudget ?? 4000;
        if (workspaceKey is null)
        {
            return PreparedChangeResult.NotCreated(parameters.Task, tokenBudget);
        }

        var includeSource = parameters.IncludeSource ?? false;
        var coreBudget = includeSource
            ? Math.Max(800, tokenBudget * 65 / 100)
            : tokenBudget;
        var result = await activeRepository.PrepareChangeAsync(
            workspaceKey,
            parameters.Task,
            parameters.StableKey,
            parameters.Id,
            coreBudget,
            parameters.MaxDepth ?? 3,
            parameters.IncludeProposed ?? false,
            focusTerms,
            cancellationToken);
        result = result with { TokenBudget = tokenBudget };
        return includeSource && result.AtlasState == "current"
            ? await AttachSourceSlicesAsync(
                result,
                parameters.SourceLineLimit ?? 24,
                cancellationToken)
            : result;
    }

    private AtlasRepository RequireRepository() => repository
        ?? throw new InvalidOperationException("Cartographer has not been initialized.");
}
