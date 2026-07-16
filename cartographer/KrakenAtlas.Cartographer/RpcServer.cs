using System.Text.Json;
using System.Text.Json.Serialization;
using KrakenAtlas.Core;
using KrakenAtlas.Protocol;

namespace KrakenAtlas.Cartographer;

internal sealed class RpcServer(Stream input, Stream output, TextWriter error)
{
    private const string ProtocolVersion = "1.0";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly CartographerSession session = new();

    public async Task<int> RunAsync(CancellationToken cancellationToken = default)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var body = await ContentLengthFraming.ReadAsync(input, cancellationToken);
            if (body is null)
            {
                return 0;
            }

            JsonRpcRequest? request;
            try
            {
                request = JsonSerializer.Deserialize<JsonRpcRequest>(body, JsonOptions);
            }
            catch (JsonException exception)
            {
                await error.WriteLineAsync($"Invalid JSON-RPC request: {exception.Message}");
                continue;
            }

            if (request is null || string.IsNullOrWhiteSpace(request.Method))
            {
                await error.WriteLineAsync("Ignored JSON-RPC request without a method.");
                continue;
            }

            var (response, shouldStop) = await HandleAsync(request, cancellationToken);
            var json = JsonSerializer.Serialize(response, JsonOptions);
            await ContentLengthFraming.WriteAsync(output, json, cancellationToken);

            if (shouldStop)
            {
                return 0;
            }
        }

        return 0;
    }

    private async Task<(JsonRpcResponse Response, bool ShouldStop)> HandleAsync(
        JsonRpcRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Jsonrpc != "2.0")
        {
            return (JsonRpcResponse.Failure(request.Id, -32600, "Invalid JSON-RPC version."), false);
        }

        try
        {
            if (request.Method == "initialize")
            {
                var parameters = DeserializeParams<InitializeParams>(request.Params);
                await session.InitializeAsync(parameters, cancellationToken);
                return (
                    JsonRpcResponse.Success(request.Id, new InitializeResult(
                        ProtocolVersion,
                        GetServiceVersion(),
                        [
                            "foundation.status",
                            "atlas.build",
                            "atlas.summary",
                            "workspace.orientation",
                            "entity.get",
                            "symbol.search",
                            "entity.search",
                            "symbol.usages",
                            "relation.query",
                            "route.trace",
                            "change.surface",
                            "framework.aspnet_core",
                            "database.ef_core",
                            "assessment.read",
                            "assessment.write",
                            "agent.prepare_change",
                            "agent.prepare_task",
                            "agent.source_slices",
                            "agent.mcp"
                        ])),
                    false);
            }

            if (request.Method == "shutdown")
            {
                return (JsonRpcResponse.Success(request.Id, new { accepted = true }), true);
            }

            if (!session.IsInitialized)
            {
                return (JsonRpcResponse.Failure(request.Id, -32002, "Cartographer is not initialized."), false);
            }

            return request.Method switch
            {
                "foundation/status" => (
                    JsonRpcResponse.Success(
                        request.Id,
                        await session.GetFoundationStatusAsync(cancellationToken)),
                    false),
                "atlas/build" => (
                    JsonRpcResponse.Success(
                        request.Id,
                        await session.BuildAtlasAsync(cancellationToken)),
                    false),
                "get_atlas_summary" => (
                    JsonRpcResponse.Success(
                        request.Id,
                        await session.GetAtlasSummaryAsync(cancellationToken)),
                    false),
                "get_workspace_orientation" => (
                    JsonRpcResponse.Success(
                        request.Id,
                        await session.GetWorkspaceOrientationAsync(cancellationToken)),
                    false),
                "get_entity" => (
                    JsonRpcResponse.Success(
                        request.Id,
                        await session.GetEntityAsync(
                            DeserializeParams<GetEntityParams>(request.Params),
                            cancellationToken)),
                    false),
                "search_symbols" => (
                    JsonRpcResponse.Success(
                        request.Id,
                        await session.SearchSymbolsAsync(
                            DeserializeParams<SearchSymbolsParams>(request.Params),
                            cancellationToken)),
                    false),
                "search_entities" => (
                    JsonRpcResponse.Success(
                        request.Id,
                        await session.SearchEntitiesAsync(
                            DeserializeParams<SearchEntitiesParams>(request.Params),
                            cancellationToken)),
                    false),
                "find_usages" => (
                    JsonRpcResponse.Success(
                        request.Id,
                        await session.FindUsagesAsync(
                            DeserializeParams<FindUsagesParams>(request.Params),
                            cancellationToken)),
                    false),
                "get_relations" => (
                    JsonRpcResponse.Success(
                        request.Id,
                        await session.GetRelationsAsync(
                            DeserializeParams<GetRelationsParams>(request.Params),
                            cancellationToken)),
                    false),
                "trace_route" => (
                    JsonRpcResponse.Success(
                        request.Id,
                        await session.TraceRouteAsync(
                            DeserializeParams<TraceRouteParams>(request.Params),
                            cancellationToken)),
                    false),
                "get_change_surface" => (
                    JsonRpcResponse.Success(
                        request.Id,
                        await session.GetChangeSurfaceAsync(
                            DeserializeParams<GetChangeSurfaceParams>(request.Params),
                            cancellationToken)),
                    false),
                "get_entity_assessments" => (
                    JsonRpcResponse.Success(
                        request.Id,
                        await session.GetAssessmentsAsync(
                            DeserializeParams<GetAssessmentsParams>(request.Params),
                            cancellationToken)),
                    false),
                "decorate_nodes" => (
                    JsonRpcResponse.Success(
                        request.Id,
                        await session.DecorateNodesAsync(
                            DeserializeParams<NodeDecorationBatch>(request.Params),
                            false,
                            cancellationToken)),
                    false),
                "prepare_change" => (
                    JsonRpcResponse.Success(
                        request.Id,
                        await session.PrepareChangeAsync(
                            DeserializeParams<PrepareChangeParams>(request.Params),
                            cancellationToken)),
                    false),
                "prepare_task" => (
                    JsonRpcResponse.Success(
                        request.Id,
                        await session.PrepareTaskAsync(
                            DeserializeParams<PrepareTaskParams>(request.Params),
                            cancellationToken)),
                    false),
                _ => (
                    JsonRpcResponse.Failure(request.Id, -32601, $"Method not found: {request.Method}"),
                    false)
            };
        }
        catch (OperationCanceledException)
        {
            return (JsonRpcResponse.Failure(request.Id, -32800, "Request cancelled."), false);
        }
        catch (Exception exception)
        {
            await error.WriteLineAsync($"{request.Method} failed: {exception}");
            return (JsonRpcResponse.Failure(request.Id, -32603, exception.Message), false);
        }
    }

    private static T DeserializeParams<T>(JsonElement value) =>
        value.Deserialize<T>(JsonOptions)
        ?? throw new InvalidDataException($"Invalid parameters for {typeof(T).Name}.");

    private static string GetServiceVersion()
    {
        var version = typeof(RpcServer).Assembly.GetName().Version ?? new Version(0, 0, 0);
        return $"{version.Major}.{version.Minor}.{Math.Max(0, version.Build)}";
    }
}
