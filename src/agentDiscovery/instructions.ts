export type AgentInstructionTargetId = "agents" | "copilot" | "claude";

export interface AgentInstructionTarget {
  id: AgentInstructionTargetId;
  label: string;
  description: string;
  relativePath: string;
}

export type AgentInstructionChange = "created" | "appended" | "updated" | "unchanged";

export interface AgentInstructionUpdate {
  change: AgentInstructionChange;
  content: string;
}

export const agentInstructionTargets: readonly AgentInstructionTarget[] = [
  {
    id: "agents",
    label: "AGENTS.md",
    description: "Codex and other agents that honor repository AGENTS.md files",
    relativePath: "AGENTS.md"
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    description: "VS Code agents that honor repository-wide Copilot instructions",
    relativePath: ".github/copilot-instructions.md"
  },
  {
    id: "claude",
    label: "CLAUDE.md",
    description: "Claude Code and compatible clients",
    relativePath: "CLAUDE.md"
  }
];

export const managedInstructionsStart = "<!-- kraken-atlas-agent-instructions:start -->";
export const managedInstructionsEnd = "<!-- kraken-atlas-agent-instructions:end -->";

const instructions = `${managedInstructionsStart}
## Kraken Atlas

Use the Kraken Atlas MCP tools as the first source of repository context before broad source exploration. Do not inspect or query the Atlas SQLite database directly.

1. Start with \`get_workspace_orientation\`.
2. If the Atlas state is \`not_created\`, call \`build_atlas\`.
3. Before rebuilding a changed workspace, call \`project_git_changes\` to understand live edits and assessments at risk.
4. For a coding task, call \`prepare_change\` with a concrete task and token budget. If it returns \`needs_seed\`, select from the ranked candidates instead of guessing.
5. Use \`search_code\`, \`get_relations\`, and \`trace_route\` to expand only the required graph neighborhood.
6. Read reusable agent conclusions with \`get_assessments\`. Call \`decorate_nodes\` only for durable, evidence-backed conclusions that should survive the current session.

Treat stable keys as canonical identities. Prefer bounded Atlas results and source excerpts over full-file reads. If the Kraken Atlas tools are unavailable, report that they must be enabled instead of treating direct SQLite access as an equivalent fallback.
${managedInstructionsEnd}`;

export function updateAgentInstructions(existing: string | undefined): AgentInstructionUpdate {
  const eol = existing?.includes("\r\n") ? "\r\n" : "\n";
  const block = instructions.replace(/\n/g, eol);

  if (existing === undefined) {
    return { change: "created", content: `${block}${eol}` };
  }

  const starts = findOccurrences(existing, managedInstructionsStart);
  const ends = findOccurrences(existing, managedInstructionsEnd);
  if (starts.length === 0 && ends.length === 0) {
    const separator = existing.length === 0
      ? ""
      : existing.endsWith(`${eol}${eol}`)
        ? ""
        : existing.endsWith(eol)
          ? eol
          : `${eol}${eol}`;
    return { change: "appended", content: `${existing}${separator}${block}${eol}` };
  }

  if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0]) {
    throw new Error(
      "The instruction file has incomplete or duplicate Kraken Atlas managed markers. " +
      "Repair the managed block before running the installer again."
    );
  }

  const end = ends[0] + managedInstructionsEnd.length;
  const content = `${existing.slice(0, starts[0])}${block}${existing.slice(end)}`;
  return { change: content === existing ? "unchanged" : "updated", content };
}

function findOccurrences(value: string, search: string): number[] {
  const occurrences: number[] = [];
  let offset = 0;
  while (offset < value.length) {
    const found = value.indexOf(search, offset);
    if (found < 0) {
      break;
    }
    occurrences.push(found);
    offset = found + search.length;
  }
  return occurrences;
}
