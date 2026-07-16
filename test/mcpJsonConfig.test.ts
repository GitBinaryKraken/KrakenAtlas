import { strict as assert } from "node:assert";
import test from "node:test";
import { McpLaunchDefinition } from "../src/agentDiscovery/mcpConnection";
import {
  claudeMcpConfigRelativePath,
  hasManagedClaudeMcpConfiguration,
  managedMcpEnvironmentKey,
  updateClaudeMcpConfiguration
} from "../src/agentDiscovery/mcpJsonConfig";

const launch: McpLaunchDefinition = {
  command: "dotnet",
  args: ["C:\\Atlas\\0.9.2\\Cartographer.dll", "--mcp", "--workspace", "E:\\Projects\\API"],
  cwd: "C:\\Atlas\\0.9.2"
};

test("creates a managed Claude-compatible project MCP configuration", () => {
  const update = updateClaudeMcpConfiguration(undefined, launch);
  const parsed = JSON.parse(update.content);

  assert.equal(claudeMcpConfigRelativePath, ".mcp.json");
  assert.equal(update.change, "created");
  assert.equal(hasManagedClaudeMcpConfiguration(update.content), true);
  assert.equal(parsed.mcpServers["kraken-atlas"].command, "dotnet");
  assert.equal(parsed.mcpServers["kraken-atlas"].env[managedMcpEnvironmentKey], "1");
});

test("preserves other servers and refreshes only the managed entry", () => {
  const existing = JSON.stringify({
    projectSetting: true,
    mcpServers: {
      existing: { command: "existing-server" }
    }
  }, null, 4).replace(/\n/g, "\r\n") + "\r\n";
  const installed = updateClaudeMcpConfiguration(existing, launch);
  const nextLaunch = {
    ...launch,
    args: ["C:\\Atlas\\0.9.3\\Cartographer.dll", ...launch.args.slice(1)],
    cwd: "C:\\Atlas\\0.9.3"
  };
  const refreshed = updateClaudeMcpConfiguration(installed.content, nextLaunch);
  const parsed = JSON.parse(refreshed.content);

  assert.equal(installed.change, "appended");
  assert.equal(installed.content.replace(/\r\n/g, "").includes("\n"), false);
  assert.equal(refreshed.change, "updated");
  assert.equal(parsed.projectSetting, true);
  assert.equal(parsed.mcpServers.existing.command, "existing-server");
  assert.equal(parsed.mcpServers["kraken-atlas"].args[0], "C:\\Atlas\\0.9.3\\Cartographer.dll");
  assert.deepEqual(updateClaudeMcpConfiguration(refreshed.content, nextLaunch), {
    change: "unchanged",
    content: refreshed.content
  });
});

test("refuses unmanaged entries and malformed JSON", () => {
  assert.throws(
    () => updateClaudeMcpConfiguration(
      JSON.stringify({ mcpServers: { "kraken-atlas": { command: "custom" } } }),
      launch
    ),
    /outside Atlas management/
  );
  assert.throws(
    () => updateClaudeMcpConfiguration("{ invalid", launch),
    /not valid JSON/
  );
});
