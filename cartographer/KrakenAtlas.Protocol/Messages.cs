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
