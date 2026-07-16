import { McpLaunchDefinition, toMcpServerConfiguration } from "./mcpConnection";

export type McpJsonConfigChange = "created" | "appended" | "updated" | "unchanged";

export interface McpJsonConfigUpdate {
  change: McpJsonConfigChange;
  content: string;
}

export const claudeMcpConfigRelativePath = ".mcp.json";
export const managedMcpEnvironmentKey = "KRAKEN_ATLAS_MANAGED_BY_EXTENSION";

export function hasManagedClaudeMcpConfiguration(content: string): boolean {
  try {
    const root = parseRoot(content);
    const entry = getRecord(getRecord(root.mcpServers)?.["kraken-atlas"]);
    const env = getRecord(entry?.env);
    return env?.[managedMcpEnvironmentKey] === "1";
  } catch {
    return false;
  }
}

export function updateClaudeMcpConfiguration(
  existing: string | undefined,
  launch: McpLaunchDefinition
): McpJsonConfigUpdate {
  const root = existing === undefined ? {} : parseRoot(existing);
  const currentServers = root.mcpServers;
  if (currentServers !== undefined && !getRecord(currentServers)) {
    throw new Error("The Claude MCP config has a non-object mcpServers value.");
  }

  const servers = getRecord(currentServers) ?? {};
  const currentEntry = servers["kraken-atlas"];
  if (currentEntry !== undefined && !isManagedEntry(currentEntry)) {
    throw new Error(
      "The Claude MCP config already defines mcpServers.kraken-atlas outside Atlas management. " +
      "Rename or remove that entry before installing the managed connection."
    );
  }

  const expectedEntry = {
    ...toMcpServerConfiguration(launch),
    env: {
      ...(launch.env ?? {}),
      [managedMcpEnvironmentKey]: "1"
    }
  };
  root.mcpServers = { ...servers, "kraken-atlas": expectedEntry };

  const eol = existing?.includes("\r\n") ? "\r\n" : "\n";
  const indent = detectIndent(existing);
  const content = `${JSON.stringify(root, null, indent).replace(/\n/g, eol)}${eol}`;
  if (existing === undefined) {
    return { change: "created", content };
  }
  if (content === existing) {
    return { change: "unchanged", content };
  }
  return { change: currentEntry === undefined ? "appended" : "updated", content };
}

function parseRoot(content: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`The Claude MCP config is not valid JSON: ${message}`);
  }
  const root = getRecord(parsed);
  if (!root) {
    throw new Error("The Claude MCP config root must be a JSON object.");
  }
  return root;
}

function isManagedEntry(value: unknown): boolean {
  const entry = getRecord(value);
  const env = getRecord(entry?.env);
  return env?.[managedMcpEnvironmentKey] === "1";
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function detectIndent(existing: string | undefined): string | number {
  const match = existing?.match(/\n([ \t]+)\S/);
  return match?.[1] ?? 2;
}
