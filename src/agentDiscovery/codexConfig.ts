import { McpLaunchDefinition } from "./mcpConnection";

export type CodexConfigChange = "created" | "appended" | "updated" | "unchanged";

export interface CodexConfigUpdate {
  change: CodexConfigChange;
  content: string;
}

export const codexConfigRelativePath = ".codex/config.toml";
export const managedCodexMcpStart = "# kraken-atlas-codex-mcp:start";
export const managedCodexMcpEnd = "# kraken-atlas-codex-mcp:end";

export function hasManagedCodexMcpConfiguration(content: string): boolean {
  return content.includes(managedCodexMcpStart) || content.includes(managedCodexMcpEnd);
}

export function updateCodexMcpConfiguration(
  existing: string | undefined,
  launch: McpLaunchDefinition
): CodexConfigUpdate {
  const eol = existing?.includes("\r\n") ? "\r\n" : "\n";
  const block = renderCodexMcpBlock(launch).replace(/\n/g, eol);

  if (existing === undefined) {
    return { change: "created", content: `${block}${eol}` };
  }

  const starts = findOccurrences(existing, managedCodexMcpStart);
  const ends = findOccurrences(existing, managedCodexMcpEnd);
  if (starts.length === 0 && ends.length === 0) {
    if (/^\s*\[mcp_servers\.kraken_atlas(?:\.|\])/m.test(existing)) {
      throw new Error(
        "The Codex config already defines mcp_servers.kraken_atlas outside the managed block. " +
        "Rename or remove that entry before installing the managed connection."
      );
    }
    const separator = existing.length === 0
      ? ""
      : existing.endsWith(`${eol}${eol}`)
        ? ""
        : existing.endsWith(eol)
          ? eol
          : `${eol}${eol}`;
    return { change: "appended", content: `${existing}${separator}${block}${eol}` };
  }

  if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0]) {
    throw new Error(
      "The Codex config has incomplete or duplicate Kraken Atlas managed markers. " +
      "Repair the managed block before running the installer again."
    );
  }

  const end = ends[0] + managedCodexMcpEnd.length;
  const content = `${existing.slice(0, starts[0])}${block}${existing.slice(end)}`;
  return { change: content === existing ? "unchanged" : "updated", content };
}

function renderCodexMcpBlock(launch: McpLaunchDefinition): string {
  return `${managedCodexMcpStart}
# Managed by Kraken Atlas. The extension refreshes this block after upgrades.
[mcp_servers.kraken_atlas]
command = ${toTomlString(launch.command)}
args = [${launch.args.map(toTomlString).join(", ")}]
cwd = ${toTomlString(launch.cwd)}
startup_timeout_sec = 30
tool_timeout_sec = 300
enabled = true
default_tools_approval_mode = "writes"
${managedCodexMcpEnd}`;
}

function toTomlString(value: string): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function findOccurrences(value: string, search: string): number[] {
  const occurrences: number[] = [];
  let offset = 0;
  while (offset < value.length) {
    const found = value.indexOf(search, offset);
    if (found < 0) {
      break;
    }
    occurrences.push(found);
    offset = found + search.length;
  }
  return occurrences;
}
