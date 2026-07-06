import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { installAgentInstructions, installAgentSkill, renderAgentInstructions, renderAgentSkill, renderQueryPlaybooksReference } from "../src/agent/terminalInstructions";

test("renderAgentInstructions gives agents terminal-first query guidance", () => {
  const instructions = renderAgentInstructions();

  assert.match(instructions, /Kraken Atlas: Check Map Health/);
  assert.match(instructions, /Kraken Atlas: Trace Feature Flow/);
  assert.match(instructions, /Terminal-based AI agents need a callable CLI/);
  assert.match(instructions, /Kraken Atlas: Install AI Agent Setup once/);
  assert.match(instructions, /If `kraken-atlas` is not recognized/);
  assert.match(instructions, /first-pass React\/TypeScript patterns/);
  assert.match(instructions, /Some agent terminals do not inherit VS Code's integrated-terminal PATH settings/);
  assert.match(instructions, /\.\\\.kraken-atlas\\bin\\kraken-atlas\.cmd --help/);
  assert.match(instructions, /Only ask the user to run Kraken Atlas: Install AI Agent Setup/);
  assert.match(instructions, /kraken-atlas --help/);
  assert.match(instructions, /## Native VS Code Agent Tools/);
  assert.match(instructions, /kraken_atlas_doctor/);
  assert.match(instructions, /kraken_atlas_query/);
  assert.match(instructions, /kraken_atlas_context_pack/);
  assert.match(instructions, /## Agent Query Loop/);
  assert.match(instructions, /## Task Playbooks/);
  assert.match(instructions, /kraken-atlas query where-to-add "requested change" --workspace \. --context ProjectOrFolderName --format agent/);
  assert.match(instructions, /kraken-atlas query orphans "optional filter" --workspace \. --context ProjectOrFolderName --format agent/);
  assert.match(instructions, /kraken-atlas query duplicates "optional filter" --workspace \. --context ProjectOrFolderName --format agent/);
  assert.match(instructions, /kraken-atlas query references "SymbolOrMethodName" --workspace \. --context ProjectOrFolderName --format agent/);
  assert.match(instructions, /kraken-atlas query symbol "ClassOrMethodName" --workspace \. --context ProjectOrFolderName --format agent/);
  assert.match(instructions, /kraken-atlas query search "natural language terms" --workspace \. --context ProjectOrFolderName --format agent/);
  assert.match(instructions, /query the map directly with `symbol`, `search`, `relationships`, or `references`/);
  assert.match(instructions, /--edge WRITES_FIELD --limit 20/);
  assert.match(instructions, /kraken-atlas context where-to-add "requested change" --workspace \. --context ProjectOrFolderName --format md/);
  assert.match(instructions, /node \.\/node_modules\/kraken-atlas\/dist\/cli\.js query flow/);
  assert.match(instructions, /\.\\\.kraken-atlas\\bin\\kraken-atlas\.cmd query where-to-add/);
  assert.match(instructions, /Partial names are okay/);
  assert.match(instructions, /AGENT_SKILL\.md/);
  assert.match(instructions, /## Token-Saving Checks/);
  assert.match(instructions, /Use `--format info` only when a richer human-readable answer is needed/);
  assert.match(instructions, /Use `context` only when a bounded pasteable context pack is needed after narrowing/);
  assert.match(instructions, /Add\/change a field/);
  assert.match(instructions, /where-to-add "add field-name to feature-name"/);
  assert.match(instructions, /Add validation\/auth/);
  assert.match(instructions, /where-to-add "add validation for request-name"/);
  assert.match(instructions, /Add endpoint\/handler/);
  assert.match(instructions, /flow "nearest existing endpoint or route"/);
  assert.match(instructions, /Add setting\/option/);
  assert.match(instructions, /USES_OPTIONS/);
  assert.match(instructions, /Trace a bug/);
  assert.match(instructions, /search "exact error message or UI label"/);
  assert.match(instructions, /Find where a UI action posts/);
  assert.match(instructions, /POSTS_TO/);
  assert.match(instructions, /React component or route work/);
  assert.match(instructions, /RENDERS_COMPONENT/);
  assert.match(instructions, /CALLS_API_ROUTE/);
  assert.match(instructions, /Find callers of a service method/);
  assert.match(instructions, /relationships "ServiceOrMethodName"/);
  assert.match(instructions, /Find where data is persisted/);
  assert.match(instructions, /where-to-add "persist field-or-entity-name"/);
  assert.match(instructions, /Create handoff context after narrowing/);
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

test("renderAgentSkill provides a project-local .agents skill", () => {
  const skill = renderAgentSkill();
  const playbooks = renderQueryPlaybooksReference();

  assert.match(skill, /^---/);
  assert.match(skill, /name: kraken-atlas/);
  assert.match(skill, /trigger: \/kraken-atlas/);
  assert.match(skill, /Use Kraken Atlas before broad source reads/);
  assert.match(skill, /first-pass React\/TypeScript codebase/);
  assert.match(skill, /\.\\\.kraken-atlas\\bin\\kraken-atlas\.cmd --help/);
  assert.match(skill, /Only ask the user to run `Kraken Atlas: Install AI Agent Setup` when the shim is missing/);
  assert.match(skill, /## Direct Map Query Loop/);
  assert.match(skill, /PropertyOrSymbolName/);
  assert.match(skill, /references\/query-playbooks\.md/);
  assert.match(playbooks, /# Kraken Atlas Query Playbooks/);
  assert.match(playbooks, /kraken-atlas query where-to-add "add field-name to feature-name"/);
  assert.match(playbooks, /React Component Or Route Work/);
  assert.match(playbooks, /USES_HOOK/);
  assert.match(playbooks, /where a property is written, displayed, model-bound, persisted, retrieved/);
  assert.match(playbooks, /If output says the search is weak/);
});

test("installAgentSkill creates and updates .agents skill files", async () => {
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
  assert.match(reference, /Trace Existing Behavior/);
  assert.strictEqual(version.trim(), "9.9.10");
});
