import * as assert from "assert";
import test from "node:test";
import { renderAgentBuildResult, renderAgentResponse } from "../src/format/agentFormatter";
import { applyCliNextCommandOptions } from "../src/format/cliNextCommands";
import type { QueryResponse } from "../src/query/queryService";

test("renderAgentResponse uses stable agent sections and compact evidence", () => {
  const output = renderAgentResponse({
    query: "save-user",
    answer: "Feature-flow slice for save-user.",
    confidence: 0.82,
    files: ["Views/User/Edit.cshtml", "wwwroot/js/user-form.js"],
    symbols: [],
    relationships: [],
    patterns: [],
    evidence: [],
    flow: [
      {
        type: "HANDLES_EVENT",
        from: "symbol:javascript:wwwroot/js/user-form.js:event:save-user:click",
        to: "symbol:razor:Views/User/Edit.cshtml:button:save-user",
        file: "wwwroot/js/user-form.js",
        range: { startLine: 9, startColumn: 1, endLine: 9, endColumn: 62 },
        evidence: "document.getElementById(\"save-user\").addEventListener(\"click\""
      }
    ],
    nextQueries: ["kraken-atlas query relationships \"save-user\""],
    estimatedContextSavings: "Returns graph records and line ranges instead of full source files."
  } satisfies QueryResponse);

  assert.match(output, /^Answer/m);
  assert.match(output, /^Open These Files/m);
  assert.match(output, /^Evidence/m);
  assert.match(output, /^Next Commands/m);
  assert.match(output, /^Stop Condition/m);
  assert.match(output, /wwwroot\/js\/user-form.js:9/);
  assert.doesNotMatch(output, /function saveUserForm[\s\S]*<\/form>/);
});

test("renderAgentBuildResult uses stable agent sections", () => {
  const output = renderAgentBuildResult({
    mode: "skipped",
    reason: "No file hash changes detected.",
    outputFolder: ".kraken-atlas",
    fileCount: 3,
    symbolCount: 11,
    referenceCount: 1,
    relationshipCount: 10,
    patternCount: 3,
    analyzerRuns: [],
    addedFiles: [],
    changedFiles: [],
    deletedFiles: []
  });

  assert.match(output, /^Answer/m);
  assert.match(output, /^Open These Files/m);
  assert.match(output, /^Evidence/m);
  assert.match(output, /^Next Commands/m);
  assert.match(output, /^Stop Condition/m);
});

test("renderAgentBuildResult surfaces failed analyzer diagnostics", () => {
  const output = renderAgentBuildResult({
    mode: "full",
    reason: "Rebuild command requested.",
    outputFolder: ".kraken-atlas",
    fileCount: 3,
    symbolCount: 0,
    referenceCount: 0,
    relationshipCount: 0,
    patternCount: 0,
    analyzerRuns: [
      {
        id: "roslyn",
        status: "failed",
        diagnosticCategory: "restore",
        diagnosticLabel: "restore/package resolution failure",
        message: "C# analyzer failed.",
        recordCounts: {
          symbols: 0,
          references: 0,
          relationships: 0,
          patterns: 0
        }
      }
    ],
    addedFiles: [],
    changedFiles: [],
    deletedFiles: []
  });

  assert.match(output, /Analyzer failed: roslyn/);
  assert.match(output, /\[restore\]/);
  assert.match(output, /kraken-atlas doctor --workspace \. --format agent/);
});

test("renderAgentResponse prioritizes where-to-add file recommendations", () => {
  const output = renderAgentResponse({
    query: "add user field",
    answer: "Likely edit locations.",
    confidence: 0.8,
    files: ["Views/User/Edit.cshtml"],
    symbols: [],
    relationships: [{ type: "POSTS_TO", from: "form", to: "route", file: "Views/User/Edit.cshtml" }],
    patterns: [{ id: "pattern:web:html-form-handler", name: "HTML form handler" }],
    flow: [],
    evidence: [
      {
        recordType: "fileRecommendation",
        file: "Views/User/Edit.cshtml",
        score: 10,
        reasons: ["Search match in symbol user field."],
        patternsToFollow: ["HTML form handler: inspect the POST target."]
      }
    ],
    nextQueries: [],
    estimatedContextSavings: "Returns graph records and line ranges instead of full source files."
  } satisfies QueryResponse);

  assert.match(output, /- Views\/User\/Edit.cshtml/);
  assert.match(output, /Views\/User\/Edit\.cshtml: Search match in symbol user field/);
  assert.doesNotMatch(output, /score 10/);
  assert.doesNotMatch(output, /POSTS_TO: form -> route/);
});

test("applyCliNextCommandOptions preserves workspace and project context in follow-up commands", () => {
  const response: QueryResponse = {
    query: "profile setup",
    answer: "Likely edit locations.",
    confidence: 0.8,
    files: ["Web/Services/UserManager.cs"],
    symbols: [],
    relationships: [],
    patterns: [],
    flow: [],
    evidence: [],
    nextQueries: [
      "kraken-atlas query relationships \"Web/Services/UserManager.cs\"",
      "kraken-atlas query relationships \"symbol:csharp:Web.RegisterModel.OnPostAsync(string)\" --workspace . --format agent"
    ],
    estimatedContextSavings: "Returns graph records and line ranges instead of full source files."
  };

  const output = applyCliNextCommandOptions(response, {
    workspaceArg: ".",
    projectContext: "Web",
    format: "agent"
  });

  assert.deepStrictEqual(output.nextQueries, [
    "kraken-atlas query relationships \"Web/Services/UserManager.cs\" --workspace . --context Web --format agent",
    "kraken-atlas query relationships \"symbol:csharp:Web.RegisterModel.OnPostAsync(string)\" --workspace . --format agent --context Web"
  ]);
});
