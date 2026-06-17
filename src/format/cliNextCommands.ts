import type { QueryResponse } from "../query/queryService";

export interface CliNextCommandOptions {
  workspaceArg: string;
  projectContext?: string;
  format: "json" | "md" | "info" | "agent";
}

export function applyCliNextCommandOptions(response: QueryResponse, options: CliNextCommandOptions): QueryResponse {
  return {
    ...response,
    nextQueries: response.nextQueries.map((command) => appendCliOptions(command, options))
  };
}

function appendCliOptions(command: string, options: CliNextCommandOptions): string {
  if (!command.startsWith("kraken-atlas ")) {
    return command;
  }

  let next = command;
  if (!/\s--workspace\b/.test(next)) {
    next += ` --workspace ${quoteCliArg(options.workspaceArg)}`;
  }
  if (options.projectContext && !/\s--context\b/.test(next)) {
    next += ` --context ${quoteCliArg(options.projectContext)}`;
  }
  if (!/\s--format\b/.test(next)) {
    next += ` --format ${quoteCliArg(options.format)}`;
  }

  return next;
}

function quoteCliArg(value: string): string {
  if (/^[A-Za-z0-9_./:\\-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
}
