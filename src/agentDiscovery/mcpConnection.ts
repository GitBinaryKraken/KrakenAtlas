export interface McpLaunchDefinition {
  command: string;
  args: readonly string[];
  cwd: string;
  env?: Readonly<Record<string, string>>;
}

export interface AtlasMcpLaunchOptions {
  assemblyPath: string;
  atlasPath: string;
  extensionPath: string;
  workspaceRoots: readonly string[];
}

export interface McpServerConfiguration {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export function createAtlasMcpLaunchDefinition(options: AtlasMcpLaunchOptions): McpLaunchDefinition {
  if (options.workspaceRoots.length === 0) {
    throw new Error("At least one workspace root is required for the Kraken Atlas MCP connection.");
  }

  return {
    command: "dotnet",
    args: [
      options.assemblyPath,
      "--mcp",
      ...options.workspaceRoots.flatMap(root => ["--workspace", root]),
      "--atlas",
      options.atlasPath
    ],
    cwd: options.extensionPath
  };
}

export function toMcpServerConfiguration(launch: McpLaunchDefinition): McpServerConfiguration {
  return {
    command: launch.command,
    args: [...launch.args],
    ...(launch.env ? { env: { ...launch.env } } : {})
  };
}

export function renderGenericMcpConfiguration(launch: McpLaunchDefinition): string {
  return `${JSON.stringify({
    mcpServers: {
      "kraken-atlas": toMcpServerConfiguration(launch)
    }
  }, null, 2)}\n`;
}
