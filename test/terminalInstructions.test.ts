import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { installAgentInstructions, renderAgentInstructions } from "../src/agent/terminalInstructions";

test("renderAgentInstructions gives agents terminal-first query guidance", () => {
  const instructions = renderAgentInstructions();

  assert.match(instructions, /Kraken Atlas: Check Map Health/);
  assert.match(instructions, /Kraken Atlas: Trace Feature Flow/);
  assert.match(instructions, /## Agent Query Loop/);
  assert.match(instructions, /## Task Playbooks/);
  assert.match(instructions, /kraken-atlas query where-to-add "requested change" --workspace \. --context ProjectOrFolderName --format agent/);
  assert.match(instructions, /kraken-atlas query search "natural language terms" --workspace \. --context ProjectOrFolderName --format agent/);
  assert.match(instructions, /kraken-atlas context where-to-add "requested change" --workspace \. --context ProjectOrFolderName --format md/);
  assert.match(instructions, /node \.\/node_modules\/kraken-atlas\/dist\/cli\.js query flow/);
  assert.match(instructions, /Partial names are okay/);
  assert.match(instructions, /AGENT_SKILL\.md/);
  assert.match(instructions, /## Token-Saving Checks/);
  assert.match(instructions, /Use `--format info` only when a richer human-readable answer is needed/);
  assert.match(instructions, /Use `context` only when a bounded pasteable context pack is needed after narrowing/);
  assert.doesNotMatch(instructions, /kraken-atlas --help/);
  assert.match(instructions, /Kraken Atlas is focused on C#\/\.NET Core/);
  assert.match(instructions, /Visual graph browsing, static HTML reports, broad narrative reports/);
});

test("installAgentInstructions creates and updates a single AGENTS.md block", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-agent-"));
  const first = await installAgentInstructions(workspaceRoot);
  const second = await installAgentInstructions(workspaceRoot);
  const content = await fs.readFile(path.join(workspaceRoot, "AGENTS.md"), "utf8");

  assert.strictEqual(first.action, "created");
  assert.strictEqual(second.action, "updated");
  assert.strictEqual((content.match(/kraken-atlas:start/g) ?? []).length, 1);
  assert.match(content, /Use Kraken Atlas before broad file reads/);
});
