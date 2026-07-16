import { strict as assert } from "node:assert";
import test from "node:test";
import {
  codexConfigRelativePath,
  hasManagedCodexMcpConfiguration,
  managedCodexMcpEnd,
  managedCodexMcpStart,
  updateCodexMcpConfiguration
} from "../src/agentDiscovery/codexConfig";
import { McpLaunchDefinition } from "../src/agentDiscovery/mcpConnection";

const configuration: McpLaunchDefinition = {
  command: "dotnet",
  args: [
    "C:\\Users\\Example\\.vscode\\extensions\\binarykraken.kraken-atlas-0.9.2\\Cartographer.dll",
    "--mcp",
    "--workspace",
    "E:\\Projects\\API",
    "--workspace",
    "E:\\Projects\\Web UI",
    "--atlas",
    "C:\\Users\\Example\\AppData\\Roaming\\Code\\workspaceStorage\\abc\\atlas.sqlite3"
  ],
  cwd: "C:\\Users\\Example\\.vscode\\extensions\\binarykraken.kraken-atlas-0.9.2"
};

test("creates a project-scoped Codex MCP configuration for the bundled Cartographer", () => {
  const update = updateCodexMcpConfiguration(undefined, configuration);

  assert.equal(codexConfigRelativePath, ".codex/config.toml");
  assert.equal(update.change, "created");
  assert.equal(hasManagedCodexMcpConfiguration(update.content), true);
  assert.match(update.content, /\[mcp_servers\.kraken_atlas\]/);
  assert.match(update.content, /command = "dotnet"/);
  assert.match(update.content, /"--mcp"/);
  assert.equal((update.content.match(/"--workspace"/g) ?? []).length, 2);
  assert.match(update.content, /default_tools_approval_mode = "writes"/);
  assert.match(update.content, /C:\\\\Users\\\\Example/);
});

test("appends to existing Codex settings and preserves CRLF line endings", () => {
  const existing = "model = \"gpt-5\"\r\n\r\n[features]\r\nweb_search = true\r\n";
  const update = updateCodexMcpConfiguration(existing, configuration);

  assert.equal(update.change, "appended");
  assert.equal(update.content.startsWith(existing), true);
  assert.equal(update.content.replace(/\r\n/g, "").includes("\n"), false);
});

test("refreshes only the managed Codex block and is idempotent", () => {
  const first = updateCodexMcpConfiguration("model = \"gpt-5\"\n", configuration);
  const nextConfiguration = {
    ...configuration,
    args: configuration.args.map(value => value.includes("binarykraken.kraken-atlas-0.9.2")
      ? "C:\\Atlas\\0.9.3\\Cartographer.dll"
      : value),
    cwd: "C:\\Atlas\\0.9.3"
  };
  const refreshed = updateCodexMcpConfiguration(first.content, nextConfiguration);

  assert.equal(refreshed.change, "updated");
  assert.equal(refreshed.content.startsWith("model = \"gpt-5\"\n\n"), true);
  assert.equal(refreshed.content.includes("binarykraken.kraken-atlas-0.9.2"), false);
  assert.match(refreshed.content, /0\.9\.3/);
  assert.deepEqual(updateCodexMcpConfiguration(refreshed.content, nextConfiguration), {
    change: "unchanged",
    content: refreshed.content
  });
});

test("refuses an unmanaged Kraken Atlas server or malformed managed markers", () => {
  assert.throws(
    () => updateCodexMcpConfiguration(
      "[mcp_servers.kraken_atlas]\ncommand = \"custom-atlas\"\n",
      configuration
    ),
    /outside the managed block/
  );
  assert.throws(
    () => updateCodexMcpConfiguration(`${managedCodexMcpStart}\nmissing end`, configuration),
    /incomplete or duplicate/
  );
  assert.throws(
    () => updateCodexMcpConfiguration(
      `${managedCodexMcpStart}\n${managedCodexMcpEnd}\n${managedCodexMcpStart}\n${managedCodexMcpEnd}`,
      configuration
    ),
    /incomplete or duplicate/
  );
});
