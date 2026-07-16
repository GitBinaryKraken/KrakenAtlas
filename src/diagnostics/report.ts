import type { AtlasCounts, AtlasHealthResult, AtlasSummary } from "../atlas/contracts";
import type { CartographerSessionInfo } from "../cartographer/client";
import type { FoundationStatus } from "../foundation/status";
import type { DotnetRuntimeInspection } from "../runtime/dotnetRuntime";
import type { AgentConnectionStatus } from "../agentDiscovery/connectionStatus";

export interface DiagnosticReportInput {
  generatedUtc?: string;
  extensionVersion: string;
  vscodeVersion: string;
  vscodeAppName: string;
  remoteName?: string;
  platform: NodeJS.Platform;
  architecture: string;
  osRelease: string;
  workspaceRoots: string[];
  atlasPath: string;
  runtime: DotnetRuntimeInspection;
  session?: CartographerSessionInfo;
  foundation?: FoundationStatus;
  summary?: AtlasSummary;
  health?: AtlasHealthResult;
  agentConnection?: AgentConnectionStatus;
  cartographerError?: string;
}

export interface DiagnosticReport {
  schemaVersion: "1.0";
  generatedUtc: string;
  notice: string;
  extension: {
    id: "BinaryKraken.kraken-atlas";
    version: string;
  };
  host: {
    vscodeVersion: string;
    vscodeAppName: string;
    remoteName?: string;
    platform: NodeJS.Platform;
    architecture: string;
    osRelease: string;
  };
  workspace: {
    roots: string[];
    atlasPath: string;
  };
  runtime: DotnetRuntimeInspection;
  cartographer: {
    protocolVersion?: string;
    serviceVersion?: string;
    capabilities: string[];
    phase?: string;
    state?: string;
    indexingState?: string;
    message?: string;
    error?: string;
  };
  atlas: {
    state: string;
    generation?: number;
    workspaceKey?: string;
    counts: AtlasCounts;
    analyzerRuns: Array<{
      analyzer: string;
      analyzerVersion: string;
      capability: string;
      status: string;
      durationMs: number;
      diagnostic?: string;
    }>;
    health?: AtlasHealthResult;
  };
  agentConnection?: AgentConnectionStatus;
  privacy: {
    containsLocalPaths: true;
    containsSourceBodies: false;
    telemetrySentByKrakenAtlas: false;
  };
}

const emptyCounts: AtlasCounts = {
  solutions: 0,
  projects: 0,
  files: 0,
  entities: 0,
  relations: 0,
  projectDependencies: 0
};

export function createDiagnosticReport(input: DiagnosticReportInput): DiagnosticReport {
  return {
    schemaVersion: "1.0",
    generatedUtc: input.generatedUtc ?? new Date().toISOString(),
    notice: "This report contains local workspace and Atlas paths, but no source file bodies.",
    extension: {
      id: "BinaryKraken.kraken-atlas",
      version: input.extensionVersion
    },
    host: {
      vscodeVersion: input.vscodeVersion,
      vscodeAppName: input.vscodeAppName,
      ...(input.remoteName ? { remoteName: input.remoteName } : {}),
      platform: input.platform,
      architecture: input.architecture,
      osRelease: input.osRelease
    },
    workspace: {
      roots: [...input.workspaceRoots],
      atlasPath: input.atlasPath
    },
    runtime: {
      ...input.runtime,
      installedCoreRuntimeVersions: [...input.runtime.installedCoreRuntimeVersions]
    },
    cartographer: {
      protocolVersion: input.session?.protocolVersion,
      serviceVersion: input.session?.serviceVersion,
      capabilities: [...(input.session?.capabilities ?? [])],
      phase: input.foundation?.phase,
      state: input.foundation?.cartographerState,
      indexingState: input.foundation?.indexingState,
      message: input.foundation?.message,
      error: input.cartographerError
    },
    atlas: {
      state: input.summary?.atlasState ?? input.foundation?.atlasState ?? "unavailable",
      generation: input.summary?.generation,
      workspaceKey: input.summary?.workspaceKey,
      counts: input.summary ? { ...input.summary.counts } : { ...emptyCounts },
      analyzerRuns: (input.summary?.analyzerRuns ?? []).map((run) => ({ ...run })),
      health: input.health
    },
    agentConnection: input.agentConnection,
    privacy: {
      containsLocalPaths: true,
      containsSourceBodies: false,
      telemetrySentByKrakenAtlas: false
    }
  };
}
