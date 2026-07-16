import { strict as assert } from "node:assert";
import test from "node:test";
import {
  agentInstructionTargets,
  hasManagedAgentInstructions,
  managedInstructionsEnd,
  managedInstructionsStart,
  updateAgentInstructions
} from "../src/agentDiscovery/instructions";

test("defines agent-neutral, Copilot, and Claude instruction targets", () => {
  assert.deepEqual(agentInstructionTargets.map(target => target.id), [
    "agents",
    "copilot",
    "claude"
  ]);
  assert.deepEqual(agentInstructionTargets.map(target => target.relativePath), [
    "AGENTS.md",
    ".github/copilot-instructions.md",
    "CLAUDE.md"
  ]);
});

test("creates bounded Atlas instructions without teaching direct SQLite access", () => {
  const update = updateAgentInstructions(undefined);

  assert.equal(update.change, "created");
  assert.match(update.content, /get_atlas_health/);
  assert.match(update.content, /get_workspace_orientation/);
  assert.match(update.content, /project_git_changes/);
  assert.match(update.content, /no_repository/);
  assert.match(update.content, /prepare_change/);
  assert.match(update.content, /Suggested workflows/);
  assert.match(update.content, /numeric `id`/);
  assert.match(update.content, /never abbreviate a stable key/);
  assert.match(update.content, /search_code` with `kinds/);
  assert.match(update.content, /Do not use it for Atlas install/);
  assert.match(update.content, /machine-local and path-bound/);
  assert.match(update.content, /Do not inspect or query the Atlas SQLite database directly/);
  assert.match(update.content, /Set Up AI Agent/);
  assert.doesNotMatch(update.content, /\.codex\/config\.toml/);
  assert.equal(update.content.endsWith("\n"), true);
});

test("appends a managed block while preserving existing CRLF instructions", () => {
  const existing = "# Existing Rules\r\n\r\nKeep this text exactly.\r\n";
  const update = updateAgentInstructions(existing);

  assert.equal(update.change, "appended");
  assert.equal(update.content.startsWith(existing), true);
  assert.equal(update.content.replace(/\r\n/g, "").includes("\n"), false);
  assert.match(update.content, new RegExp(managedInstructionsStart));
});

test("updates only the managed block and is idempotent", () => {
  const existing = [
    "# Existing Rules",
    "",
    managedInstructionsStart,
    "old instructions",
    managedInstructionsEnd,
    "",
    "Keep this footer."
  ].join("\n");
  const updated = updateAgentInstructions(existing);

  assert.equal(updated.change, "updated");
  assert.equal(updated.content.startsWith("# Existing Rules\n\n"), true);
  assert.equal(updated.content.endsWith("\n\nKeep this footer."), true);
  assert.equal(updated.content.includes("old instructions"), false);
  assert.deepEqual(updateAgentInstructions(updated.content), {
    change: "unchanged",
    content: updated.content
  });
  assert.equal(hasManagedAgentInstructions(updated.content), true);
  assert.equal(hasManagedAgentInstructions("# Unmanaged instructions"), false);
});

test("rejects incomplete or duplicate managed blocks", () => {
  assert.throws(
    () => updateAgentInstructions(`${managedInstructionsStart}\nmissing end`),
    /incomplete or duplicate/
  );
  assert.throws(
    () => updateAgentInstructions(
      `${managedInstructionsStart}\n${managedInstructionsEnd}\n${managedInstructionsStart}\n${managedInstructionsEnd}`
    ),
    /incomplete or duplicate/
  );
});
