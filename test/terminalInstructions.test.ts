import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import {
  installAgentInstructions,
  installAgentSkill,
  renderAgentInstructions,
  renderAgentSkill,
  renderQueryPlaybooksReference
} from "../src/agent/terminalInstructions";

const removedFeatures = /where-to-add|plan-change|pattern-map|hotspots|orphans|duplicates|code health/i;

test("renderAgentInstructions teaches direct relationship queries", () => {
  const instructions = renderAgentInstructions();

  assert.match(instructions, /## Agent Query Loop/);
  assert.match(instructions, /query project/);
  assert.match(instructions, /query symbol "ClassOrMethodName"/);
  assert.match(instructions, /query references "Namespace\.Type\.Method"/);
  assert.match(instructions, /query relationships "Namespace\.Type"/);
  assert.match(instructions, /--edge CALLS --limit 30/);
  assert.match(instructions, /\.NET Core and C# semantic relationship accuracy are the highest priority/);
  assert.doesNotMatch(instructions, removedFeatures);
});

test("installAgentInstructions creates and updates one AGENTS.md block", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-agent-"));
  const first = await installAgentInstructions(workspaceRoot);
  const second = await installAgentInstructions(workspaceRoot);
  const content = await fs.readFile(path.join(workspaceRoot, "AGENTS.md"), "utf8");

  assert.strictEqual(first.action, "created");
  assert.strictEqual(second.action, "updated");
  assert.strictEqual((content.match(/kraken-atlas:start/g) ?? []).length, 1);
  assert.match(content, /Use Kraken Atlas before broad file reads/);
});

test("renderAgentSkill provides relationship query playbooks", () => {
  const skill = renderAgentSkill();
  const playbooks = renderQueryPlaybooksReference();

  assert.match(skill, /^---/);
  assert.match(skill, /name: kraken-atlas/);
  assert.match(skill, /trigger: \/kraken-atlas/);
  assert.match(skill, /relationship map, not an implementation planner/);
  assert.match(skill, /references\/query-playbooks\.md/);
  assert.match(playbooks, /# Kraken Atlas Relationship Query Playbooks/);
  assert.match(playbooks, /Find Callers And Callees/);
  assert.match(playbooks, /IMPLEMENTS, INJECTS, and REGISTERS/);
  assert.match(playbooks, /MAPS_ROUTE, CALLS, REQUIRES_AUTH/);
  assert.doesNotMatch(`${skill}\n${playbooks}`, removedFeatures);
});

test("installAgentSkill creates and updates project-local skill files", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-agent-skill-"));
  const first = await installAgentSkill(workspaceRoot, "9.9.9");
  const second = await installAgentSkill(workspaceRoot, "9.9.10");
  const skill = await fs.readFile(path.join(workspaceRoot, ".agents", "skills", "kraken-atlas", "SKILL.md"), "utf8");
  const reference = await fs.readFile(path.join(workspaceRoot, ".agents", "skills", "kraken-atlas", "references", "query-playbooks.md"), "utf8");
  const version = await fs.readFile(path.join(workspaceRoot, ".agents", "skills", "kraken-atlas", ".kraken_atlas_version"), "utf8");

  assert.strictEqual(first.action, "created");
  assert.strictEqual(second.action, "updated");
  assert.strictEqual(first.skillPath, path.join(workspaceRoot, ".agents", "skills", "kraken-atlas", "SKILL.md"));
  assert.match(skill, /name: kraken-atlas/);
  assert.match(reference, /Follow ASP\.NET Core Entry Points/);
  assert.strictEqual(version.trim(), "9.9.10");
});
