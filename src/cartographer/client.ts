import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { AtlasSummary, BuildAtlasResult, EntityDetail } from "../atlas/contracts";
import { FoundationStatus } from "../foundation/status";
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

export class CartographerClient {
  private process: ChildProcessWithoutNullStreams | undefined;
  private starting: Promise<void> | undefined;
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

  async getEntity(stableKey?: string, id?: number): Promise<EntityDetail | undefined> {
    await this.ensureStarted();
    return this.request<EntityDetail | undefined>("get_entity", { stableKey, id });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.ensureStarted();
  }

  dispose(): void {
    void this.stop();
  }

  private async ensureStarted(): Promise<void> {
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
    child.on("error", (error) => this.failPending(error));
    child.on("close", (code) => {
      if (this.process === child) {
        this.process = undefined;
      }
      this.failPending(new Error(`Cartographer exited with code ${String(code)}.`));
    });

    try {
      await this.request("initialize", {
        client: "vscode",
        protocolVersion: "1.0",
        workspaceRoots: this.workspaceRoots,
        atlasPath: this.atlasPath
      });
    } catch (error) {
      child.kill();
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

  private async stop(): Promise<void> {
    const child = this.process;
    if (!child) {
      return;
    }

    try {
      await this.request("shutdown");
    } catch (error) {
      this.log(`Cartographer shutdown warning: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (!child.killed) {
        child.stdin.end();
      }
      if (this.process === child) {
        this.process = undefined;
      }
    }
  }
}
