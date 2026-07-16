import { strict as assert } from "node:assert";
import test from "node:test";
import {
  AgentConnectionReceipt,
  evaluateAgentConnection,
  parseAgentConnectionReceipt,
  renderAgentConnectionStatus
} from "../src/agentDiscovery/connectionStatus";

const receipt: AgentConnectionReceipt = {
  schemaVersion: "1.0",
  clientName: "Codex",
  clientVersion: "1.2.3",
  serverVersion: "0.9.6",
  protocolVersion: "2025-11-25",
  workspaceKey: "workspace:test",
  workspaceRoots: ["E:\\Projects\\App"],
  atlasPath: "C:\\Storage\\atlas.sqlite3",
  initializedUtc: "2026-07-16T18:00:00.000Z",
  toolsListedUtc: "2026-07-16T18:00:01.000Z",
  healthCalledUtc: "2026-07-16T18:00:02.000Z",
  lastSeenUtc: "2026-07-16T18:00:02.000Z"
};

const options = {
  extensionVersion: "0.9.6",
  atlasPath: "C:\\Storage\\atlas.sqlite3",
  workspaceRoots: ["E:\\Projects\\App"]
};

test("parses source-free MCP connection receipts", () => {
  assert.deepEqual(parseAgentConnectionReceipt(JSON.stringify(receipt)), receipt);
  assert.equal(parseAgentConnectionReceipt("{}"), undefined);
  assert.equal(parseAgentConnectionReceipt("not json"), undefined);
});

test("connection status requires a current health-verified receipt", () => {
  const connected = evaluateAgentConnection([receipt], {
    ...options,
    pendingSetup: {
      schemaVersion: "1.0",
      clientLabel: "Codex",
      configuredUtc: "2026-07-16T17:59:00.000Z",
      extensionVersion: "0.9.6"
    }
  });
  assert.equal(connected.state, "connected_current");
  assert.equal(connected.setupPending, false);
  assert.match(renderAgentConnectionStatus(connected, "0.9.6"), /Health called: 2026/);

  const setupAfterReceipt = evaluateAgentConnection([receipt], {
    ...options,
    pendingSetup: {
      schemaVersion: "1.0",
      clientLabel: "Codex",
      configuredUtc: "2026-07-16T18:01:00.000Z",
      extensionVersion: "0.9.6"
    }
  });
  assert.equal(setupAfterReceipt.state, "configured_not_verified");
  assert.equal(setupAfterReceipt.setupPending, true);

  const toolsOnly = evaluateAgentConnection([{
    ...receipt,
    healthCalledUtc: undefined,
    lastSeenUtc: receipt.toolsListedUtc!
  }], options);
  assert.equal(toolsOnly.state, "tools_discovered");
  assert.match(toolsOnly.recommendations[0], /get_atlas_health/);

  const old = evaluateAgentConnection([{ ...receipt, serverVersion: "0.9.5" }], options);
  assert.equal(old.state, "connected_old_version");
});

test("connection status distinguishes pending setup and path changes", () => {
  const pending = evaluateAgentConnection([], {
    ...options,
    pendingSetup: {
      schemaVersion: "1.0",
      clientLabel: "Claude Code",
      configuredUtc: "2026-07-16T18:00:00.000Z",
      extensionVersion: "0.9.6"
    }
  });
  assert.equal(pending.state, "configured_not_verified");
  assert.equal(pending.setupPending, true);

  const moved = evaluateAgentConnection([receipt], {
    ...options,
    workspaceRoots: ["E:\\Projects\\MovedApp"]
  });
  assert.equal(moved.state, "path_changed");
});
