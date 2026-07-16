import * as path from "node:path";

export const agentConnectionDirectoryName = "agent-connections";
export const pendingAgentSetupFileName = "agent-setup.pending.json";

export interface AgentConnectionReceipt {
  schemaVersion: "1.0";
  clientName: string;
  clientVersion?: string;
  serverVersion: string;
  protocolVersion: string;
  workspaceKey: string;
  workspaceRoots: string[];
  atlasPath: string;
  initializedUtc?: string;
  toolsListedUtc?: string;
  healthCalledUtc?: string;
  lastSeenUtc: string;
}

export interface PendingAgentSetup {
  schemaVersion: "1.0";
  clientLabel: string;
  configuredUtc: string;
  extensionVersion: string;
}

export type AgentConnectionState =
  | "connected_current"
  | "connected_old_version"
  | "tools_discovered"
  | "initialized"
  | "path_changed"
  | "configured_not_verified"
  | "not_verified";

export interface AgentConnectionStatus {
  state: AgentConnectionState;
  message: string;
  clients: AgentConnectionReceipt[];
  latest?: AgentConnectionReceipt;
  setupPending: boolean;
  recommendations: string[];
}

export interface AgentConnectionEvaluationOptions {
  extensionVersion: string;
  atlasPath: string;
  workspaceRoots: string[];
  pendingSetup?: PendingAgentSetup;
}

export function parseAgentConnectionReceipt(value: string): AgentConnectionReceipt | undefined {
  try {
    const candidate = JSON.parse(value) as Partial<AgentConnectionReceipt>;
    return candidate.schemaVersion === "1.0"
      && typeof candidate.clientName === "string"
      && typeof candidate.serverVersion === "string"
      && typeof candidate.protocolVersion === "string"
      && typeof candidate.workspaceKey === "string"
      && Array.isArray(candidate.workspaceRoots)
      && candidate.workspaceRoots.every(root => typeof root === "string")
      && typeof candidate.atlasPath === "string"
      && typeof candidate.lastSeenUtc === "string"
      ? candidate as AgentConnectionReceipt
      : undefined;
  } catch {
    return undefined;
  }
}

export function evaluateAgentConnection(
  receipts: readonly AgentConnectionReceipt[],
  options: AgentConnectionEvaluationOptions
): AgentConnectionStatus {
  const clients = [...receipts].sort((left, right) =>
    Date.parse(right.lastSeenUtc) - Date.parse(left.lastSeenUtc));
  const matching = clients.filter(receipt =>
    pathsEqual(receipt.atlasPath, options.atlasPath)
    && rootsEqual(receipt.workspaceRoots, options.workspaceRoots));
  const configuredAt = options.pendingSetup
    ? Date.parse(options.pendingSetup.configuredUtc)
    : undefined;
  const followsPendingSetup = (timestamp: string | undefined): boolean =>
    timestamp !== undefined
    && (configuredAt === undefined || Date.parse(timestamp) >= configuredAt);
  const verifiedCurrent = matching.find(receipt =>
    receipt.serverVersion === options.extensionVersion
    && followsPendingSetup(receipt.healthCalledUtc));
  if (verifiedCurrent) {
    return status(
      "connected_current",
      `${verifiedCurrent.clientName} verified Kraken Atlas ${verifiedCurrent.serverVersion} through get_atlas_health.`,
      clients,
      verifiedCurrent,
      false,
      ["Use the permanent Atlas workflow instructions; no setup action is required."]);
  }

  const verifiedOld = matching.find(receipt => followsPendingSetup(receipt.healthCalledUtc));
  if (verifiedOld) {
    return status(
      "connected_old_version",
      `${verifiedOld.clientName} last verified Atlas ${verifiedOld.serverVersion}, not ${options.extensionVersion}.`,
      clients,
      verifiedOld,
      options.pendingSetup !== undefined,
      ["Restart the agent so it launches the current managed MCP configuration."]);
  }

  const toolsDiscovered = matching.find(receipt =>
    receipt.serverVersion === options.extensionVersion
    && followsPendingSetup(receipt.toolsListedUtc));
  if (toolsDiscovered) {
    return status(
      "tools_discovered",
      `${toolsDiscovered.clientName} discovered Atlas tools but has not completed a health call.`,
      clients,
      toolsDiscovered,
      true,
      ["Ask the agent to call get_atlas_health once to finish verification."]);
  }

  const initialized = matching.find(receipt =>
    receipt.serverVersion === options.extensionVersion
    && followsPendingSetup(receipt.initializedUtc));
  if (initialized) {
    return status(
      "initialized",
      `${initialized.clientName} initialized Atlas but has not listed tools.`,
      clients,
      initialized,
      true,
      ["Restart or enable the Atlas MCP server in the agent, then list tools and call get_atlas_health."]);
  }

  const observedAfterSetup = clients.some(receipt => followsPendingSetup(receipt.lastSeenUtc));
  if (options.pendingSetup && !observedAfterSetup) {
    return status(
      "configured_not_verified",
      `${options.pendingSetup.clientLabel} setup is configured but no agent has verified the connection since setup.`,
      clients,
      clients[0],
      true,
      ["Restart the selected agent and ask it to call get_atlas_health."]);
  }

  if (clients.length > 0) {
    return status(
      "path_changed",
      "Existing Atlas connection receipts target different workspace roots or Atlas storage.",
      clients,
      clients[0],
      true,
      ["Run Kraken Atlas: Set Up AI Agent, restart the agent, and call get_atlas_health."]);
  }

  if (options.pendingSetup) {
    return status(
      "configured_not_verified",
      `${options.pendingSetup.clientLabel} setup is configured but no agent has verified the connection.`,
      [],
      undefined,
      true,
      ["Restart the selected agent and ask it to call get_atlas_health."]);
  }

  return status(
    "not_verified",
    "No AI agent has verified the Kraken Atlas MCP connection for this workspace.",
    [],
    undefined,
    false,
    ["Run Kraken Atlas: Set Up AI Agent for a non-native client, then call get_atlas_health from the agent."]);
}

export function renderAgentConnectionStatus(
  connection: AgentConnectionStatus,
  extensionVersion: string
): string {
  const lines = [
    `Kraken Atlas ${extensionVersion}`,
    `Agent connection: ${connection.state}`,
    `Setup pending: ${connection.setupPending ? "yes" : "no"}`,
    "",
    connection.message
  ];
  if (connection.latest) {
    lines.push(
      "",
      `Client: ${connection.latest.clientName}${connection.latest.clientVersion ? ` ${connection.latest.clientVersion}` : ""}`,
      `Server: ${connection.latest.serverVersion}`,
      `Last seen: ${connection.latest.lastSeenUtc}`,
      `Initialized: ${connection.latest.initializedUtc ?? "no"}`,
      `Tools listed: ${connection.latest.toolsListedUtc ?? "no"}`,
      `Health called: ${connection.latest.healthCalledUtc ?? "no"}`
    );
  }
  if (connection.recommendations.length > 0) {
    lines.push("", "Next actions:");
    for (const recommendation of connection.recommendations) {
      lines.push(`- ${recommendation}`);
    }
  }
  return lines.join("\n");
}

function status(
  state: AgentConnectionState,
  message: string,
  clients: AgentConnectionReceipt[],
  latest: AgentConnectionReceipt | undefined,
  setupPending: boolean,
  recommendations: string[]
): AgentConnectionStatus {
  return { state, message, clients, latest, setupPending, recommendations };
}

function rootsEqual(left: readonly string[], right: readonly string[]): boolean {
  const normalizedLeft = left.map(normalizePath).sort(pathSort);
  const normalizedRight = right.map(normalizePath).sort(pathSort);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function pathsEqual(left: string, right: string): boolean {
  return normalizePath(left) === normalizePath(right);
}

function normalizePath(value: string): string {
  const normalized = path.resolve(value).replaceAll("\\", "/").replace(/\/$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function pathSort(left: string, right: string): number {
  return left.localeCompare(right);
}
