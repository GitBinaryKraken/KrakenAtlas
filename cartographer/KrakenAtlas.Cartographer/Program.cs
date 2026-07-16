using KrakenAtlas.Cartographer;

if (args.Length > 0 && args[0] == "--mcp")
{
    return await McpServer.RunAsync(args.Skip(1).ToArray(), Console.Error);
}

if (args.Length > 0 && args[0] != "--stdio")
{
    return await CliApplication.RunAsync(args, Console.Out, Console.Error);
}

var server = new RpcServer(
    Console.OpenStandardInput(),
    Console.OpenStandardOutput(),
    Console.Error);

return await server.RunAsync();
