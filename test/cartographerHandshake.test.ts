import { strict as assert } from "node:assert";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  AtlasSummary,
  BuildAtlasResult,
  CodeUsageResult,
  EntityDetail,
  SymbolSearchResult,
  WorkspaceOrientation
} from "../src/atlas/contracts";
import { encodeJsonRpcMessage, JsonRpcFramer } from "../src/cartographer/jsonRpcFraming";

interface RpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

class CartographerHarness {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly framer = new JsonRpcFramer();
  private readonly messages: unknown[] = [];
  private readonly waiters: Array<(value: unknown) => void> = [];
  private nextId = 1;
  private stderr = "";

  constructor(assembly: string) {
    this.child = spawn("dotnet", [assembly], { stdio: "pipe", windowsHide: true });
    this.child.stdout.on("data", (chunk: Buffer) => {
      for (const message of this.framer.push(chunk)) {
        const waiter = this.waiters.shift();
        if (waiter) {
          waiter(message);
        } else {
          this.messages.push(message);
        }
      }
    });
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderr += chunk.toString("utf8");
    });
  }

  async request<T>(method: string, params: unknown = {}): Promise<T> {
    const id = this.nextId++;
    this.child.stdin.write(encodeJsonRpcMessage({ jsonrpc: "2.0", id, method, params }));
    const response = await this.nextMessage() as RpcResponse<T>;
    assert.equal(response.jsonrpc, "2.0");
    assert.equal(response.id, id);
    if (response.error) {
      throw new Error(`${response.error.code}: ${response.error.message}`);
    }
    return response.result as T;
  }

  async stop(): Promise<void> {
    if (this.child.exitCode !== null) {
      return;
    }
    await this.request<{ accepted: boolean }>("shutdown");
    if (this.child.exitCode === null) {
      await once(this.child, "exit");
    }
  }

  async terminate(): Promise<void> {
    if (this.child.exitCode === null) {
      const exited = once(this.child, "exit");
      this.child.kill();
      await exited;
    }
  }

  private nextMessage(): Promise<unknown> {
    const queued = this.messages.shift();
    if (queued !== undefined) {
      return Promise.resolve(queued);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timed out waiting for Cartographer. ${this.stderr}`)),
        10000
      );
      this.waiters.push((value) => {
        clearTimeout(timeout);
        resolve(value);
      });
    });
  }
}

test("Cartographer persists an atomic workspace Atlas across process restarts", async () => {
  const expectedVersion = (JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")
  ) as { version: string }).version;
  const assembly = path.resolve(
    process.cwd(),
    "cartographer",
    "KrakenAtlas.Cartographer",
    "bin",
    "Release",
    "net10.0",
    "KrakenAtlas.Cartographer.dll"
  );
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kraken-atlas-"));
  const workspaceRoot = path.join(temporaryRoot, "workspace");
  const unavailableRoot = path.join(temporaryRoot, "workspace-unavailable");
  const atlasPath = path.join(temporaryRoot, "storage", "atlas.sqlite3");
  fs.cpSync(path.resolve(process.cwd(), "test-fixtures", "workspace-discovery"), workspaceRoot, {
    recursive: true
  });

  const start = async () => {
    const cartographer = new CartographerHarness(assembly);
    const initialized = await cartographer.request<{
      protocolVersion: string;
      serviceVersion: string;
      capabilities: string[];
    }>("initialize", {
      client: "integration-test",
      protocolVersion: "1.0",
      workspaceRoots: [workspaceRoot],
      atlasPath
    });
    assert.equal(initialized.protocolVersion, "1.0");
    assert.equal(initialized.serviceVersion, expectedVersion);
    assert.deepEqual(initialized.capabilities, [
      "foundation.status",
      "atlas.build",
      "atlas.summary",
      "workspace.orientation",
      "entity.get",
      "symbol.search",
      "symbol.usages"
    ]);
    return cartographer;
  };

  let cartographer = await start();
  try {
    const initialStatus = await cartographer.request<{ atlasState: string }>("foundation/status");
    assert.equal(initialStatus.atlasState, "not_created");
    const initialOrientation = await cartographer.request<WorkspaceOrientation>("get_workspace_orientation");
    assert.equal(initialOrientation.atlasState, "not_created");

    const firstBuild = await cartographer.request<BuildAtlasResult>("atlas/build");
    assert.equal(firstBuild.generation, 1);
    assert.deepEqual(firstBuild.counts, {
      solutions: 1,
      projects: 2,
      files: 7,
      entities: 38,
      relations: 40,
      projectDependencies: 1
    });
    assert.equal(fs.existsSync(atlasPath), true);

    const firstSummary = await cartographer.request<AtlasSummary>("get_atlas_summary");
    assert.equal(firstSummary.atlasState, "current");
    assert.equal(firstSummary.projects.length, 2);
    const app = firstSummary.projects.find(project => project.name === "App");
    assert.ok(app);
    assert.equal(app.projectKind, "application");
    assert.equal(app.targetFrameworks, "net10.0");
    assert.equal(app.dependencyCount, 1);

    const orientation = await cartographer.request<WorkspaceOrientation>("get_workspace_orientation");
    assert.equal(orientation.projects.length, 2);
    assert.deepEqual(
      orientation.projects.find(project => project.name === "App")?.facets.map(facet => facet.facet),
      ["application"]
    );
    assert.ok(orientation.commands.some(command => command.commandText.includes("dotnet run")));
    assert.ok(orientation.workspaceBuildDimensions.some(dimension =>
      dimension.kind === "dotnet_sdk_version" && dimension.value === "10.0.100"));

    const firstEntity = await cartographer.request<EntityDetail>("get_entity", {
      stableKey: app.stableKey
    });
    assert.equal(firstEntity.kind, "project");
    assert.equal(firstEntity.qualifiedName, "src/App/App.csproj");
    assert.equal(firstEntity.incomingRelations, 5);
    assert.equal(firstEntity.outgoingRelations, 9);
    assert.equal(firstEntity.locations[0]?.relativePath, "src/App/App.csproj");

    const greeterSearch = await cartographer.request<SymbolSearchResult>("search_symbols", {
      query: "Greeter",
      limit: 10
    });
    assert.equal(greeterSearch.atlasState, "current");
    const greeter = greeterSearch.matches.find(match => match.kind === "class" && match.name === "Greeter");
    assert.ok(greeter);
    assert.equal(greeter.qualifiedName, "Sample.Lib.Greeter");
    assert.equal(greeter.firstDefinition?.relativePath, "src/Lib/Greeter.cs");
    assert.equal(greeter.firstDefinition?.isGenerated, false);

    const getMessageSearch = await cartographer.request<SymbolSearchResult>("search_symbols", {
      query: "GetMessage",
      limit: 10
    });
    const getMessage = getMessageSearch.matches.find(match =>
      match.qualifiedName === "Sample.Lib.Greeter.GetMessage()");
    assert.ok(getMessage);
    const getMessageUsages = await cartographer.request<CodeUsageResult>("find_usages", {
      stableKey: getMessage.stableKey,
      limit: 10
    });
    assert.ok(getMessageUsages.usages.some(usage => usage.relationKind === "calls"));

    const secondBuild = await cartographer.request<BuildAtlasResult>("atlas/build");
    assert.equal(secondBuild.generation, 2);
    const secondEntity = await cartographer.request<EntityDetail>("get_entity", { id: firstEntity.id });
    assert.equal(secondEntity.id, firstEntity.id);
    assert.equal(secondEntity.stableKey, firstEntity.stableKey);
    assert.equal(secondEntity.generation, 2);
    const secondGreeterSearch = await cartographer.request<SymbolSearchResult>("search_symbols", {
      query: "Greeter",
      limit: 10
    });
    const secondGreeter = secondGreeterSearch.matches.find(match => match.kind === "class" && match.name === "Greeter");
    assert.equal(secondGreeter?.stableKey, greeter.stableKey);
    assert.equal(secondGreeter?.id, greeter.id);

    fs.renameSync(workspaceRoot, unavailableRoot);
    await assert.rejects(() => cartographer.request("atlas/build"), /Workspace root does not exist/);
    const afterFailure = await cartographer.request<AtlasSummary>("get_atlas_summary");
    assert.equal(afterFailure.generation, 2);
    fs.renameSync(unavailableRoot, workspaceRoot);

    await cartographer.stop();
    cartographer = await start();
    const reopened = await cartographer.request<AtlasSummary>("get_atlas_summary");
    assert.equal(reopened.generation, 2);
    assert.deepEqual(reopened.counts, secondBuild.counts);
    await cartographer.stop();

    const cliSummary = JSON.parse(execFileSync("dotnet", [
      assembly,
      "summary",
      "--workspace",
      workspaceRoot,
      "--atlas",
      atlasPath
    ], { encoding: "utf8" })) as AtlasSummary;
    assert.equal(cliSummary.generation, 2);

    const cliOrientation = JSON.parse(execFileSync("dotnet", [
      assembly,
      "orientation",
      "--workspace",
      workspaceRoot,
      "--atlas",
      atlasPath
    ], { encoding: "utf8" })) as WorkspaceOrientation;
    assert.equal(cliOrientation.generation, 2);
    assert.equal(cliOrientation.commands.length, 7);

    const cliEntity = JSON.parse(execFileSync("dotnet", [
      assembly,
      "entity",
      "--workspace",
      workspaceRoot,
      "--atlas",
      atlasPath,
      "--stable-key",
      app.stableKey
    ], { encoding: "utf8" })) as EntityDetail;
    assert.equal(cliEntity.id, firstEntity.id);

    const cliSymbols = JSON.parse(execFileSync("dotnet", [
      assembly,
      "symbols",
      "--workspace",
      workspaceRoot,
      "--atlas",
      atlasPath,
      "--query",
      "GetMessage",
      "--limit",
      "5"
    ], { encoding: "utf8" })) as SymbolSearchResult;
    assert.ok(cliSymbols.matches.some(match => match.qualifiedName === "Sample.Lib.Greeter.GetMessage()"));

    const cliUsages = JSON.parse(execFileSync("dotnet", [
      assembly,
      "usages",
      "--workspace",
      workspaceRoot,
      "--atlas",
      atlasPath,
      "--stable-key",
      getMessage.stableKey,
      "--kind",
      "calls",
      "--limit",
      "5"
    ], { encoding: "utf8" })) as CodeUsageResult;
    assert.ok(cliUsages.usages.some(usage => usage.relationKind === "calls"));

    const nestedRootBuild = JSON.parse(execFileSync("dotnet", [
      assembly,
      "build",
      "--workspace",
      workspaceRoot,
      "--workspace",
      path.join(workspaceRoot, "src"),
      "--atlas",
      path.join(temporaryRoot, "storage", "nested-roots.sqlite3")
    ], { encoding: "utf8" })) as BuildAtlasResult;
    assert.equal(nestedRootBuild.counts.projects, 2);
    assert.equal(nestedRootBuild.counts.files, 7);
  } finally {
    await cartographer.terminate();
    if (fs.existsSync(unavailableRoot) && !fs.existsSync(workspaceRoot)) {
      fs.renameSync(unavailableRoot, workspaceRoot);
    }
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
