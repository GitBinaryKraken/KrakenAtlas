import * as fs from "fs/promises";
import * as path from "path";

const beginMarker = "<!-- kraken-atlas:start -->";
const endMarker = "<!-- kraken-atlas:end -->";

export interface InstallAgentInstructionsResult {
  filePath: string;
  action: "created" | "updated";
}

export async function installAgentInstructions(workspaceRoot: string): Promise<InstallAgentInstructionsResult> {
  const filePath = path.join(workspaceRoot, "AGENTS.md");
  const block = renderAgentInstructions();
  const existing = await readOptional(filePath);
  const action: "created" | "updated" = existing === null ? "created" : "updated";
  const content = existing === null ? `${block}\n` : upsertBlock(existing, block);

  await fs.writeFile(filePath, content, "utf8");
  return { filePath, action };
}

export function renderAgentInstructions(): string {
  return `${beginMarker}
# Kraken Atlas

Use Kraken Atlas before broad file reads, recursive search, or opening many source files. The goal is to answer: "What is the smallest reliable slice of this codebase I need to inspect for the current task?"

The project map is local and queryable from VS Code through the Command Palette. If the workspace CLI shim is installed, agents can also call \`kraken-atlas\` from a new VS Code integrated terminal.

## Agent Query Loop

1. Check map health.
2. Pick the target project/folder context when the workspace has multiple projects.
3. Run \`where-to-add\` for change planning, or \`flow\` for behavior tracing.
4. Expand only with \`relationships\`, \`references\`, \`symbol\`, or \`search\` when the first answer is not enough.
5. Export a context pack only after query results prove which files matter.
6. Stop opening more files once the returned evidence answers the immediate task.

## VS Code Commands

- Kraken Atlas: Check Map Health
- Kraken Atlas: Show Project Summary
- Kraken Atlas: Trace Feature Flow
- Kraken Atlas: Suggest Where To Add Code
- Kraken Atlas: Show Relationships
- Kraken Atlas: Export Context Pack
- Kraken Atlas: Install CLI For Workspace Terminals

## Local Package CLI Commands

If the workspace CLI shim has been installed, new VS Code integrated terminals can use:

\`\`\`bash
kraken-atlas doctor --workspace . --format agent
kraken-atlas query project --workspace . --format agent
kraken-atlas query where-to-add "requested change" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query flow "feature or behavior" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query relationships "FileOrSymbolName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query search "natural language terms" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas context where-to-add "requested change" --workspace . --context ProjectOrFolderName --format md
\`\`\`

If the npm package is installed locally instead, use:

\`\`\`bash
node ./node_modules/kraken-atlas/dist/cli.js doctor --workspace . --format agent
node ./node_modules/kraken-atlas/dist/cli.js query where-to-add "requested change" --workspace . --context ProjectOrFolderName --format agent
node ./node_modules/kraken-atlas/dist/cli.js query flow "feature or behavior" --workspace . --context ProjectOrFolderName --format agent
node ./node_modules/kraken-atlas/dist/cli.js query relationships "NameOrSymbolId" --workspace . --context ProjectOrFolderName --format agent
node ./node_modules/kraken-atlas/dist/cli.js context where-to-add "requested change" --workspace . --context ProjectOrFolderName --format md
\`\`\`

## Query-First Rules

- Start with \`.kraken-atlas/agent-readme.md\` when it exists.
- If available, read the packaged \`AGENT_SKILL.md\` once for the Kraken Atlas query workflow.
- Run \`doctor --format agent\` or the VS Code Kraken Atlas: Check Map Health command before trusting query results.
- Run Kraken Atlas: Update Map For Changed Files, or \`kraken-atlas update --workspace . --format agent\`, when health or query output reports a stale map.
- If terminal use is needed, ask the user to run Kraken Atlas: Install CLI For Workspace Terminals, then open a new VS Code terminal.
- Prefer \`--format agent\` for terminal output intended for AI-agent consumption.
- Use \`--format info\` only when a richer human-readable answer is needed.
- Prefer \`where-to-add\`, \`flow\`, and \`relationships\` over reading full files.
- In parent workspaces with multiple projects, add \`--context ProjectOrFolderName\` so broad queries resolve inside the intended project first. Partial names are okay when they clearly match one indexed project, such as \`--context WebUI\` for \`Kelp2025_WebUI\`.
- Use returned file paths and line ranges to open only the smallest useful source slices.
- Follow \`Next Commands\` one hop at a time before expanding scope.
- Use \`search\` for fallback discovery when \`where-to-add\` or \`flow\` does not find enough evidence.
- Use \`context\` only when a bounded pasteable context pack is needed after narrowing the target.

## Token-Saving Checks

- Count how many files you opened; fewer is better.
- Prefer one compact context pack over many full source files.
- Keep follow-up query count low by using the returned \`Next Commands\`.
- Do not expand beyond the listed files when the evidence is enough.
- If the top files do not include the likely edit location, run a narrower query before opening more files.

## Task Playbooks

- Add or change a feature: run \`where-to-add "requested change" --workspace . --context ProjectOrFolderName --format agent\`, open the top files, then follow relationships for only the files you will edit.
- Trace existing behavior: run \`flow "behavior name" --workspace . --context ProjectOrFolderName --format agent\`, then inspect the listed route/controller/page/service/data files.
- Find callers or dependencies: run \`relationships "FileOrSymbolName" --workspace . --context ProjectOrFolderName --format agent\`.
- Add validation or authorization: run \`where-to-add "add validation for request" --workspace . --context ProjectOrFolderName --format agent\`, then inspect validator, controller/page, and service evidence.
- Add a setting or option: run \`where-to-add "add setting" --workspace . --context ProjectOrFolderName --format agent\`, then inspect options/config binding and consumers.
- Find UI-to-backend wiring: run \`flow "button/form/action name" --workspace . --context ProjectOrFolderName --format agent\`, then inspect Razor/HTML, vanilla JS, route, and handler evidence.
- Fallback text discovery: run \`search "natural language terms" --workspace . --context ProjectOrFolderName --format agent\`.

## Scope

Kraken Atlas is focused on C#/.NET Core, ASP.NET Core, Razor/HTML, and vanilla JavaScript patterns. Visual graph browsing, static HTML reports, broad narrative reports, hosted code analysis, and MCP-first workflows are not v1 goals.
${endMarker}`;
}

function upsertBlock(existing: string, block: string): string {
  const start = existing.indexOf(beginMarker);
  const end = existing.indexOf(endMarker);

  if (start >= 0 && end > start) {
    return `${existing.slice(0, start)}${block}${existing.slice(end + endMarker.length)}`.replace(/\s+$/u, "\n");
  }

  const separator = existing.endsWith("\n") ? "\n" : "\n\n";
  return `${existing}${separator}${block}\n`;
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}
