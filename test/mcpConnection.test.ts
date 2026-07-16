import { strict as assert } from "node:assert";
import test from "node:test";
import {
  createAtlasMcpLaunchDefinition,
  renderGenericMcpConfiguration
} from "../src/agentDiscovery/mcpConnection";

test("creates one agent-neutral launch definition for every MCP adapter", () => {
  const launch = createAtlasMcpLaunchDefinition({
    assemblyPath: "C:\\Atlas\\Cartographer.dll",
    atlasPath: "C:\\Atlas\\workspace.sqlite3",
    extensionPath: "C:\\Atlas",
    workspaceRoots: ["E:\\Projects\\API", "E:\\Projects\\Web UI"]
  });

  assert.equal(launch.command, "dotnet");
  assert.deepEqual(launch.args, [
    "C:\\Atlas\\Cartographer.dll",
    "--mcp",
    "--workspace",
    "E:\\Projects\\API",
    "--workspace",
    "E:\\Projects\\Web UI",
    "--atlas",
    "C:\\Atlas\\workspace.sqlite3"
  ]);
  const generic = JSON.parse(renderGenericMcpConfiguration(launch));
  assert.deepEqual(generic.mcpServers["kraken-atlas"], {
    command: launch.command,
    args: launch.args
  });
});

test("requires at least one workspace root", () => {
  assert.throws(
    () => createAtlasMcpLaunchDefinition({
      assemblyPath: "C:\\Atlas\\Cartographer.dll",
      atlasPath: "C:\\Atlas\\workspace.sqlite3",
      extensionPath: "C:\\Atlas",
      workspaceRoots: []
    }),
    /At least one workspace root/
  );
});
