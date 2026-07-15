import { ChildProcess, ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  AtlasSummary,
  BuildAtlasResult,
  CodeUsageResult,
  EntityDetail,
  SymbolSearchResult,
  WorkspaceOrientation
} from "../atlas/contracts";
import { FoundationStatus } from "../foundation/status";
import { createDotnetRuntimeRequirementError, inspectDotnetRuntime } from "../runtime/dotnetRuntime";
import { encodeJsonRpcMessage, JsonRpcFramer } from "./jsonRpcFraming";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

export interface CartographerSessionInfo {
  protocolVersion: string;
  serviceVersion: string;
  capabilities: string[];
}

const shutdownResponseTimeoutMs = 2_000;
const shutdownExitTimeoutMs = 2_000;
const forcedExitTimeoutMs = 2_000;

export function waitForProcessExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (hasExited(child)) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let timeout: NodeJS.Timeout | undefined;
    let settled = false;
    const finish = (exited: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);

    child.once("exit", onExit);
    if (hasExited(child)) {
      finish(true);
      return;
    }

    timeout = setTimeout(() => finish(false), Math.max(0, timeoutMs));
  });
}

export class CartographerClient {
  private process: ChildProcessWithoutNullStreams | undefined;
  private starting: Promise<void> | undefined;
  private stopping: Promise<void> | undefined;
  private sessionInfo: CartographerSessionInfo | undefined;
  private readonly framer = new JsonRpcFramer();
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;

  constructor(
    private readonly extensionRoot: string,
    private readonly workspaceRoots: string[],
    private readonly atlasPath: string,
    private readonly log: (message: string) => void
  ) {}

  async getFoundationStatus(): Promise<FoundationStatus> {
    await this.ensureStarted();
    return this.request<FoundationStatus>("foundation/status");
  }

  async buildAtlas(): Promise<BuildAtlasResult> {
    await this.ensureStarted();
    return this.request<BuildAtlasResult>("atlas/build");
  }

  async getAtlasSummary(): Promise<AtlasSummary> {
    await this.ensureStarted();
    return this.request<AtlasSummary>("get_atlas_summary");
  }

  async getWorkspaceOrientation(): Promise<WorkspaceOrientation> {
    await this.ensureStarted();
    return this.request<WorkspaceOrientation>("get_workspace_orientation");
  }

  async getEntity(stableKey?: string, id?: number): Promise<EntityDetail | undefined> {
    await this.ensureStarted();
    return this.request<EntityDetail | undefined>("get_entity", { stableKey, id });
  }

  async searchSymbols(query: string, limit = 25): Promise<SymbolSearchResult> {
    await this.ensureStarted();
    return this.request<SymbolSearchResult>("search_symbols", { query, limit });
  }

  async findUsages(stableKey?: string, id?: number, kinds?: string[], limit = 50): Promise<CodeUsageResult> {
    await this.ensureStarted();
    return this.request<CodeUsageResult>("find_usages", { stableKey, id, kinds, limit });
  }

  async restart(): Promise<void> {
    await this.shutdown();
    await this.ensureStarted();
  }

  async getSessionInfo(): Promise<CartographerSessionInfo> {
    await this.ensureStarted();
    if (!this.sessionInfo) {
      throw new Error("Cartographer did not provide initialization metadata.");
    }
    return {
      ...this.sessionInfo,
      capabilities: [...this.sessionInfo.capabilities]
    };
  }

  dispose(): void {
    void this.shutdown().catch((error) => {
      this.log(`Cartographer disposal warning: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  shutdown(): Promise<void> {
    if (!this.stopping) {
      const stopping = this.stop().finally(() => {
        if (this.stopping === stopping) {
          this.stopping = undefined;
        }
      });
      this.stopping = stopping;
    }
    return this.stopping;
  }

  private async ensureStarted(): Promise<void> {
    if (this.stopping) {
      await this.stopping;
    }
    if (this.process) {
      return;
    }
    if (!this.starting) {
      this.starting = this.startProcess().finally(() => {
        this.starting = undefined;
      });
    }
    await this.starting;
  }

  private async startProcess(): Promise<void> {
    const runtime = await inspectDotnetRuntime();
    if (!runtime.available) {
      throw createDotnetRuntimeRequirementError(runtime);
    }

    const assemblyPath = this.resolveAssemblyPath();
    fs.mkdirSync(path.dirname(this.atlasPath), { recursive: true });
    this.log(`Starting Cartographer: dotnet ${assemblyPath}`);

    const child = spawn("dotnet", [assemblyPath], {
      cwd: this.extensionRoot,
      stdio: "pipe",
      windowsHide: true
    });
    this.process = child;

    child.stdout.on("data", (chunk: Buffer) => this.handleOutput(chunk));
    child.stderr.on("data", (chunk: Buffer) => this.log(`Cartographer: ${chunk.toString("utf8").trimEnd()}`));
    child.on("error", (error) => {
      if (this.process === child) {
        this.failPending(error);
      }
    });
    child.on("close", (code) => {
      this.releaseProcess(child, new Error(`Cartographer exited with code ${String(code)}.`));
    });

    try {
      this.sessionInfo = await this.request<CartographerSessionInfo>("initialize", {
        client: "vscode",
        protocolVersion: "1.0",
        workspaceRoots: this.workspaceRoots,
        atlasPath: this.atlasPath
      });
    } catch (error) {
      if (!hasExited(child)) {
        child.kill("SIGKILL");
        if (!await waitForProcessExit(child, forcedExitTimeoutMs)) {
          throw new Error("Cartographer initialization failed and the process could not be terminated.", {
            cause: error
          });
        }
      }
      this.releaseProcess(child, new Error("Cartographer initialization failed."));
      throw error;
    }
  }

  private resolveAssemblyPath(): string {
    const candidates = [
      path.join(this.extensionRoot, "cartographer", "KrakenAtlas.Cartographer", "publish", "KrakenAtlas.Cartographer.dll"),
      path.join(this.extensionRoot, "cartographer", "KrakenAtlas.Cartographer", "bin", "Release", "net10.0", "KrakenAtlas.Cartographer.dll")
    ];
    const match = candidates.find((candidate) => fs.existsSync(candidate));
    if (!match) {
      throw new Error("Cartographer is not built. Run `npm run publish:cartographer` and retry.");
    }
    return match;
  }

  private request<T = unknown>(method: string, params: unknown = {}): Promise<T> {
    const child = this.process;
    if (!child) {
      return Promise.reject(new Error("Cartographer is not running."));
    }

    const id = this.nextRequestId++;
    const message = encodeJsonRpcMessage({ jsonrpc: "2.0", id, method, params });
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject
      });
      child.stdin.write(message, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  private handleOutput(chunk: Buffer): void {
    for (const value of this.framer.push(chunk)) {
      const response = value as Partial<JsonRpcResponse>;
      if (typeof response.id !== "number") {
        continue;
      }
      const request = this.pending.get(response.id);
      if (!request) {
        continue;
      }
      this.pending.delete(response.id);
      if (response.error) {
        request.reject(new Error(`Cartographer ${response.error.code}: ${response.error.message}`));
      } else {
        request.resolve(response.result);
      }
    }
  }

  private failPending(error: Error): void {
    for (const request of this.pending.values()) {
      request.reject(error);
    }
    this.pending.clear();
  }

  private releaseProcess(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.process !== child) {
      return;
    }
    this.process = undefined;
    this.sessionInfo = undefined;
    this.failPending(error);
  }

  private async stop(): Promise<void> {
    if (this.starting) {
      try {
        await this.starting;
      } catch {
        return;
      }
    }

    const child = this.process;
    if (!child) {
      return;
    }

    try {
      await withTimeout(
        this.request("shutdown"),
        shutdownResponseTimeoutMs,
        "Timed out waiting for the Cartographer shutdown response."
      );
    } catch (error) {
      this.log(`Cartographer shutdown warning: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (!child.stdin.destroyed && !child.stdin.writableEnded) {
        child.stdin.end();
      }
    }

    if (!await waitForProcessExit(child, shutdownExitTimeoutMs)) {
      this.log("Cartographer did not exit after shutdown; terminating the process.");
      child.kill("SIGKILL");
      if (!await waitForProcessExit(child, forcedExitTimeoutMs)) {
        throw new Error("Cartographer did not exit after forced termination.");
      }
    }

    this.releaseProcess(child, new Error("Cartographer stopped."));
  }
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}
