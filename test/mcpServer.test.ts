import { strict as assert } from "node:assert";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { once } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { AtlasHealthResult, BuildAtlasResult, TaskContextResult } from "../src/atlas/contracts";

interface McpResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

interface McpToolResult<T> {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: T;
  isError: boolean;
}

class McpHarness {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly messages: unknown[] = [];
  private readonly waiters: Array<(value: unknown) => void> = [];
  private nextId = 1;
  private buffer = "";
  private stderr = "";

  constructor(assembly: string, workspaceRoot: string, atlasPath: string) {
    this.child = spawn("dotnet", [
      assembly,
      "--mcp",
      "--workspace",
      workspaceRoot,
      "--atlas",
      atlasPath
    ], { stdio: "pipe", windowsHide: true });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.accept(chunk));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      this.stderr += chunk;
    });
  }

  async request<T>(method: string, params: unknown = {}): Promise<T> {
    const id = this.nextId++;
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    const response = await this.nextMessage() as McpResponse<T>;
    assert.equal(response.id, id);
    if (response.error) {
      throw new Error(`${response.error.code}: ${response.error.message}`);
    }
    return response.result as T;
  }

  notify(method: string, params: unknown = {}): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async stop(): Promise<void> {
    if (this.child.exitCode !== null) {
      return;
    }
    const exited = once(this.child, "exit");
    this.child.stdin.end();
    await exited;
  }

  async terminate(): Promise<void> {
    if (this.child.exitCode === null) {
      const exited = once(this.child, "exit");
      this.child.kill();
      await exited;
    }
  }

  private accept(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) {
        return;
      }
      const line = this.buffer.slice(0, newline).trimEnd();
      this.buffer = this.buffer.slice(newline + 1);
      if (line.length === 0) {
        continue;
      }
      const message = JSON.parse(line) as unknown;
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(message);
      } else {
        this.messages.push(message);
      }
    }
  }

  private nextMessage(): Promise<unknown> {
    const queued = this.messages.shift();
    if (queued !== undefined) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timed out waiting for MCP response. ${this.stderr}`)),
        15000
      );
      this.waiters.push((value) => {
        clearTimeout(timeout);
        resolve(value);
      });
    });
  }
}

test("MCP exposes task-first, token-budgeted Atlas tools over stdio", async () => {
  const assembly = path.resolve(
    process.cwd(),
    "cartographer",
    "KrakenAtlas.Cartographer",
    "bin",
    "Release",
    "net10.0",
    "KrakenAtlas.Cartographer.dll"
  );
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kraken-atlas-mcp-"));
  const workspaceRoot = path.join(temporaryRoot, "workspace");
  const atlasPath = path.join(temporaryRoot, "atlas", "atlas.sqlite3");
  const pendingSetupPath = path.join(path.dirname(atlasPath), "agent-setup.pending.json");
  fs.cpSync(path.resolve(process.cwd(), "test-fixtures", "workspace-discovery"), workspaceRoot, {
    recursive: true
  });
  fs.mkdirSync(path.dirname(atlasPath), { recursive: true });
  fs.writeFileSync(pendingSetupPath, `${JSON.stringify({
    schemaVersion: "1.0",
    clientLabel: "Integration test",
    configuredUtc: new Date().toISOString(),
    extensionVersion: "0.9.5"
  })}\n`);
  const mcp = new McpHarness(assembly, workspaceRoot, atlasPath);
  try {
    const initialized = await mcp.request<{
      protocolVersion: string;
      capabilities: { tools: { listChanged: boolean } };
      serverInfo: { name: string; version: string };
      instructions: string;
    }>("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "integration-test", version: "1.0.0" }
    });
    assert.equal(initialized.protocolVersion, "2025-11-25");
    assert.equal(initialized.serverInfo.name, "kraken-atlas");
    assert.equal(initialized.capabilities.tools.listChanged, false);
    assert.match(initialized.instructions, /before broad source exploration/);
    assert.match(initialized.instructions, /get_atlas_health/);
    assert.match(initialized.instructions, /no_repository/);
    assert.match(initialized.instructions, /prepare_change/);
    assert.match(initialized.instructions, /numeric id/);
    assert.match(initialized.instructions, /never abbreviate/);
    mcp.notify("notifications/initialized");

    const listed = await mcp.request<{
      tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }>;
    }>("tools/list");
    assert.deepEqual(listed.tools.map(tool => tool.name), [
      "get_atlas_health",
      "build_atlas",
      "get_atlas_summary",
      "get_workspace_orientation",
      "search_code",
      "get_relations",
      "trace_route",
      "project_git_changes",
      "prepare_change",
      "get_assessments",
      "decorate_nodes"
    ]);
    assert.equal(listed.tools.find(tool => tool.name === "search_code")?.annotations.readOnlyHint, true);
    assert.equal(listed.tools.find(tool => tool.name === "decorate_nodes")?.annotations.readOnlyHint, false);

    const health = await mcp.request<McpToolResult<AtlasHealthResult>>("tools/call", {
      name: "get_atlas_health",
      arguments: {}
    });
    assert.equal(health.isError, false);
    assert.equal(health.structuredContent.atlasState, "not_created");
    assert.equal(health.structuredContent.buildRequired, true);
    assert.equal(fs.existsSync(pendingSetupPath), true);
    fs.writeFileSync(pendingSetupPath, `${JSON.stringify({
      schemaVersion: "1.0",
      clientLabel: "Integration test",
      configuredUtc: new Date().toISOString(),
      extensionVersion: initialized.serverInfo.version
    })}\n`);
    const verifiedHealth = await mcp.request<McpToolResult<AtlasHealthResult>>("tools/call", {
      name: "get_atlas_health",
      arguments: {}
    });
    assert.equal(verifiedHealth.isError, false);
    assert.equal(fs.existsSync(pendingSetupPath), false);
    const receiptDirectory = path.join(path.dirname(atlasPath), "agent-connections");
    const receiptFiles = fs.readdirSync(receiptDirectory);
    assert.equal(receiptFiles.length, 1);
    const receipt = JSON.parse(fs.readFileSync(
      path.join(receiptDirectory, receiptFiles[0]), "utf8"
    )) as {
      clientName: string;
      serverVersion: string;
      initializedUtc: string;
      toolsListedUtc: string;
      healthCalledUtc: string;
      atlasPath: string;
    };
    assert.equal(receipt.clientName, "integration-test");
    assert.equal(receipt.serverVersion, initialized.serverInfo.version);
    assert.ok(receipt.initializedUtc);
    assert.ok(receipt.toolsListedUtc);
    assert.ok(receipt.healthCalledUtc);
    assert.equal(receipt.atlasPath, path.resolve(atlasPath));

    const orientation = await mcp.request<McpToolResult<{ atlasState: string }>>("tools/call", {
      name: "get_workspace_orientation",
      arguments: {},
      _meta: {
        progressToken: "codex-tool-call-1",
        "client/requestId": "compatibility-regression"
      }
    });
    assert.equal(orientation.isError, false);
    assert.equal(orientation.structuredContent.atlasState, "not_created");

    const invalidEnvelope = await mcp.request<McpToolResult<{ error: string }>>("tools/call", {
      name: "get_atlas_summary",
      arguments: {},
      unexpected: true
    });
    assert.equal(invalidEnvelope.isError, true);
    assert.match(invalidEnvelope.structuredContent.error, /could not be mapped/);

    const beforeBuild = await mcp.request<McpToolResult<TaskContextResult>>("tools/call", {
      name: "prepare_change",
      arguments: { task: "Change the GetMessage behavior" }
    });
    assert.equal(beforeBuild.structuredContent.atlasState, "not_created");

    const built = await mcp.request<McpToolResult<BuildAtlasResult>>("tools/call", {
      name: "build_atlas",
      arguments: {}
    });
    assert.equal(built.isError, false);
    assert.equal(built.structuredContent.generation, 1);

    const ambiguous = await mcp.request<McpToolResult<TaskContextResult>>("tools/call", {
      name: "prepare_change",
      arguments: {
        task: "Change project behavior",
        query: "project",
        tokenBudget: 1800
      }
    });
    assert.equal(ambiguous.isError, false);
    assert.equal(ambiguous.structuredContent.resolution, "needs_seed");
    assert.ok(ambiguous.structuredContent.candidates.length >= 2);
    assert.deepEqual(
      ambiguous.structuredContent.candidates.map(candidate => candidate.rank),
      ambiguous.structuredContent.candidates.map((_, index) => index + 1)
    );
    assert.match(ambiguous.structuredContent.candidates[0].selectionReason, /project/);
    const retry = ambiguous.structuredContent.nextActions[0];
    assert.equal(retry.tool, "prepare_change");
    assert.equal(retry.arguments.id, ambiguous.structuredContent.candidates[0].entity.id);

    const selected = await mcp.request<McpToolResult<TaskContextResult>>("tools/call", {
      name: retry.tool,
      arguments: retry.arguments
    });
    assert.equal(selected.structuredContent.resolution, "exact");

    const prepared = await mcp.request<McpToolResult<TaskContextResult>>("tools/call", {
      name: "prepare_change",
      arguments: {
        task: "Change the GetMessage behavior",
        query: "GetMessage",
        tokenBudget: 1800,
        includeSource: true,
        sourceLineLimit: 8
      }
    });
    assert.equal(prepared.isError, false);
    assert.equal(prepared.structuredContent.resolution, "auto");
    const pack = prepared.structuredContent.contextPack;
    assert.ok(pack);
    assert.ok(pack.estimatedTokens <= pack.tokenBudget);
    assert.ok(pack.sourceSlicesIncluded >= 1);
    const source = pack.items.find(item => item.source)?.source;
    assert.ok(source);
    assert.equal(source.relativePath, "src/Lib/Greeter.cs");
    assert.ok(source.endLine - source.startLine + 1 <= 8);
    assert.match(source.content, /GetMessage/);

    await mcp.stop();
  } finally {
    await mcp.terminate();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
