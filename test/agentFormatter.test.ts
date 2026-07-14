import * as assert from "assert";
import test from "node:test";
import { applyCliNextCommandOptions } from "../src/format/cliNextCommands";
import { renderAgentBuildResult, renderAgentResponse } from "../src/format/agentFormatter";
import type { QueryResponse } from "../src/query/queryService";

test("renderAgentResponse keeps direct relationship evidence compact", () => {
  const response = queryResponse({
    query: "UserService",
    answer: "Found 1 relationship.",
    files: ["Services/UserService.cs"],
    relationships: [{
      id: "relationship:calls:user",
      type: "CALLS",
      from: "symbol:csharp:Web.UserController.Get()",
      to: "symbol:csharp:Core.IUserService.Get()",
      file: "Controllers/UserController.cs",
      range: { startLine: 14, startColumn: 9, endLine: 14, endColumn: 28 },
      confidence: 0.98
    }]
  });

  const rendered = renderAgentResponse(response);

  assert.match(rendered, /^Answer/m);
  assert.match(rendered, /CALLS: UserController\.Get\(\.\.\.\) -> IUserService\.Get\(\.\.\.\)/);
  assert.match(rendered, /Controllers\/UserController\.cs:14/);
  assert.doesNotMatch(rendered, /where-to-add|pattern fit|hotspot/i);
});

test("renderAgentResponse formats project map counts", () => {
  const response = queryResponse({
    query: "project",
    answer: "Project map ready.",
    evidence: [{
      recordType: "projectSummary",
      workspaceName: "Example",
      schemaVersion: "0.2.0",
      generatedAt: "2026-07-13T00:00:00.000Z",
      recordCounts: { files: 12, symbols: 30, references: 18, relationships: 24 },
      languages: [{ language: "csharp", fileCount: 12 }],
      projects: ["Web/Web.csproj"]
    }]
  });

  const rendered = renderAgentResponse(response);
  assert.match(rendered, /12 files, 30 symbols, 24 relationships, 18 references/);
  assert.doesNotMatch(rendered, /patterns|findings/i);
});

test("renderAgentBuildResult reports only map records", () => {
  const rendered = renderAgentBuildResult({
    outputFolder: "E:/Example/.kraken-atlas",
    fileCount: 10,
    symbolCount: 20,
    referenceCount: 30,
    relationshipCount: 40,
    analyzerRuns: [],
    mode: "full",
    reason: "Rebuild command requested.",
    addedFiles: [],
    changedFiles: [],
    deletedFiles: []
  });

  assert.match(rendered, /Files: 10/);
  assert.match(rendered, /References: 30/);
  assert.match(rendered, /Relationships: 40/);
  assert.doesNotMatch(rendered, /Patterns:|Findings:/);
});

test("applyCliNextCommandOptions preserves workspace and project context", () => {
  const response = applyCliNextCommandOptions(queryResponse({
    query: "save user",
    answer: "Found.",
    nextQueries: ['kraken-atlas query relationships "Web/User.cs"']
  }), { workspaceArg: ".", projectContext: "WebUI", format: "agent" });

  assert.strictEqual(response.nextQueries[0], 'kraken-atlas query relationships "Web/User.cs" --workspace . --context WebUI --format agent');
});

function queryResponse(overrides: Partial<QueryResponse>): QueryResponse {
  return {
    query: "query",
    answer: "answer",
    confidence: 1,
    evidence: [],
    files: [],
    symbols: [],
    relationships: [],
    flow: [],
    nextQueries: [],
    estimatedContextSavings: "compact graph records",
    ...overrides
  };
}
