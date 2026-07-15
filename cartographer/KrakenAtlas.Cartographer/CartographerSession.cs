using System.Diagnostics;
using KrakenAtlas.Analyzers.Roslyn;
using KrakenAtlas.Core;
using KrakenAtlas.Protocol;
using KrakenAtlas.Storage.Sqlite;
using KrakenAtlas.Workspace;

namespace KrakenAtlas.Cartographer;

internal sealed class CartographerSession
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
        CSharpSemanticSnapshot semanticSnapshot;
        var semanticStopwatch = Stopwatch.StartNew();
        try
        {
            semanticSnapshot = await csharpDeclarationAnalyzer.AnalyzeAsync(snapshot, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception)
        {
            semanticStopwatch.Stop();
            semanticSnapshot = new CSharpSemanticSnapshot(
                [],
                [],
                new AnalyzerExecution(
                    CSharpDeclarationAnalyzer.AnalyzerName,
                    CSharpDeclarationAnalyzer.AnalyzerVersion,
                    CSharpDeclarationAnalyzer.Capability,
                    "failed",
                    semanticStopwatch.ElapsedMilliseconds,
                    $"{exception.GetType().Name}: {exception.Message}"));
        }
        workspaceKey = snapshot.StableKey;
        var result = await activeRepository.BuildAsync(snapshot, semanticSnapshot, cancellationToken);
        stopwatch.Stop();
        return result with { DurationMs = stopwatch.ElapsedMilliseconds };
    }

    public Task<AtlasSummary> GetAtlasSummaryAsync(CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        return workspaceKey is null
            ? Task.FromResult(AtlasSummary.NotCreated())
            : activeRepository.GetSummaryAsync(workspaceKey, cancellationToken);
    }

    public Task<WorkspaceOrientation> GetWorkspaceOrientationAsync(CancellationToken cancellationToken)
    {
        var activeRepository = RequireRepository();
        return workspaceKey is null
            ? Task.FromResult(WorkspaceOrientation.NotCreated())
            : activeRepository.GetWorkspaceOrientationAsync(workspaceKey, cancellationToken);
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

    private AtlasRepository RequireRepository() => repository
        ?? throw new InvalidOperationException("Cartographer has not been initialized.");
}
