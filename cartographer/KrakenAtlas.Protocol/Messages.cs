using System.Text.Json;

namespace KrakenAtlas.Protocol;

public sealed record JsonRpcRequest(string Jsonrpc, JsonElement Id, string Method, JsonElement Params);

public sealed record JsonRpcError(int Code, string Message);

public sealed record JsonRpcResponse(string Jsonrpc, object? Id, object? Result, JsonRpcError? Error)
{
    public static JsonRpcResponse Success(JsonElement id, object? result) =>
        new("2.0", id.Clone(), result, null);

    public static JsonRpcResponse Failure(JsonElement id, int code, string message) =>
        new("2.0", id.Clone(), null, new JsonRpcError(code, message));
}

public sealed record InitializeResult(
    string ProtocolVersion,
    string ServiceVersion,
    IReadOnlyList<string> Capabilities);

public sealed record InitializeParams(
    string Client,
    string ProtocolVersion,
    IReadOnlyList<string> WorkspaceRoots,
    string AtlasPath);

public sealed record GetEntityParams(string? StableKey, long? Id);

public sealed record SearchSymbolsParams(string Query, int? Limit);

public sealed record SearchEntitiesParams(
    string Query,
    IReadOnlyList<string>? Kinds,
    int? Limit);

public sealed record FindUsagesParams(
    string? StableKey,
    long? Id,
    IReadOnlyList<string>? Kinds,
    int? Limit);

public sealed record GetRelationsParams(
    string? StableKey,
    long? Id,
    string? Direction,
    IReadOnlyList<string>? Domains,
    IReadOnlyList<string>? Kinds,
    int? Limit);

public sealed record TraceRouteParams(
    string? SourceStableKey,
    long? SourceId,
    string? TargetStableKey,
    long? TargetId,
    IReadOnlyList<string>? ViaStableKeys,
    IReadOnlyList<string>? Domains,
    IReadOnlyList<string>? Kinds,
    int? MaxDepth,
    int? MaxVisited);

public sealed record GetChangeSurfaceParams(
    string? StableKey,
    long? Id,
    IReadOnlyList<string>? Domains,
    IReadOnlyList<string>? Kinds,
    int? MaxDepth,
    int? MaxEntities);

public sealed record GetGitChangesParams(
    string? Mode,
    string? BaseRef,
    string? TargetRef,
    int? MaxDepth,
    int? MaxEntities,
    int? MaxFiles);

public sealed record GetAssessmentsParams(
    string? StableKey,
    long? Id,
    bool? IncludeProposed,
    bool? IncludeStale,
    bool? IncludeHistory,
    int? Limit);

public sealed record PrepareChangeParams(
    string Task,
    string? StableKey,
    long? Id,
    int? TokenBudget,
    int? MaxDepth,
    bool? IncludeProposed,
    bool? IncludeSource = null,
    int? SourceLineLimit = null);

public sealed record PrepareTaskParams(
    string Task,
    string? Query,
    string? StableKey,
    long? Id,
    int? TokenBudget,
    int? MaxDepth,
    bool? IncludeProposed,
    bool? IncludeSource,
    int? SourceLineLimit,
    int? CandidateLimit);
