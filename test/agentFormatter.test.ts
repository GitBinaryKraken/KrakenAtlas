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

test("renderAgentResponse shows flow coverage scores", () => {
  const output = renderAgentResponse({
    query: "authenticated user flags a location review for moderation",
    answer: "Partial feature-flow slice.",
    confidence: 0.4,
    files: ["Services/EditAccessService.cs"],
    symbols: [],
    relationships: [],
    patterns: [],
    evidence: [
      {
        recordType: "flowCoverage",
        matchedConcepts: ["authenticated", "user"],
        missingConcepts: ["flag", "location", "review", "moderation"],
        scores: { textSimilarity: 0.2, graphConnectivity: 0.5, featureCoverage: 0.33 },
        message: "Feature coverage 2/6; graph connectivity 50%."
      },
      {
        recordType: "strongAnchor",
        id: "symbol:csharp:Web.Controllers.LocationController.FlagReview(FlagLocationReviewRequest)",
        file: "Web/Controllers/LocationController.cs",
        range: { startLine: 412 },
        matchedConcepts: ["flag", "location", "review"]
      }
    ],
    flow: [{
      type: "CALLS",
      from: "symbol:csharp:EditAccessService.GetOrCreateAsync",
      to: "symbol:csharp:EditAccessService.CurrentUserIsAuthenticated",
      file: "Services/EditAccessService.cs"
    }],
    nextQueries: [],
    estimatedContextSavings: "Returns graph records and line ranges instead of full source files."
  } satisfies QueryResponse);

  assert.match(output, /Coverage: Feature coverage 2\/6/);
  assert.match(output, /Similarity 0\.2, connectivity 0\.5, feature 0\.33/);
  assert.match(output, /Strong anchor: LocationController\.FlagReview\(\.\.\.\).*LocationController\.cs:412/);
});

test("renderAgentResponse opens visible flow evidence files before broader flow files", () => {
  const output = renderAgentResponse({
    query: "profile photo upload",
    answer: "Feature-flow slice for profile photo upload.",
    confidence: 0.82,
    files: [
      "Web/Controllers/FormsController.cs",
      "Web/Components/ImageViewComponent.cs",
      "Web/Areas/Identity/Pages/Account/ExternalLogin.cshtml.cs"
    ],
    symbols: [],
    relationships: [],
    patterns: [],
    evidence: [],
    flow: [
      {
        type: "CALLS",
        from: "symbol:csharp:Web.Controllers.FormsController.ImageUpload(IFormFile)",
        to: "symbol:csharp:Web.Controllers.FormsController.ForwardCookies(HttpRequestMessage)",
        file: "Web/Controllers/FormsController.cs",
        range: { startLine: 42, startColumn: 1, endLine: 42, endColumn: 20 },
        evidence: "ForwardCookies(request)"
      },
      {
        type: "CALLS",
        from: "symbol:csharp:Web.Components.ImageViewComponent.InvokeAsync()",
        to: "symbol:csharp:Web.Components.ImageViewComponent.ResolveImageModel()",
        file: "Web/Components/ImageViewComponent.cs",
        range: { startLine: 20, startColumn: 1, endLine: 20, endColumn: 20 },
        evidence: "ResolveImageModel(config)"
      }
    ],
    nextQueries: [],
    estimatedContextSavings: "Returns graph records and line ranges instead of full source files."
  } satisfies QueryResponse);

  assert.match(output, /1\. Web\/Controllers\/FormsController\.cs/);
  assert.match(output, /2\. Web\/Components\/ImageViewComponent\.cs/);
  assert.doesNotMatch(output, /Open These Files[\s\S]*ExternalLogin\.cshtml\.cs[\s\S]*Evidence/);
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
    findingCount: 2,
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
    findingCount: 0,
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
        recordType: "patternFit",
        patternId: "pattern:web:html-form-handler",
        patternName: "HTML form handler",
        category: "ui-flow",
        confidence: 0.82,
        frequency: 4,
        guidance: "Mirror the existing form, route, handler, and validation path.",
        matchedFiles: ["Views/User/Edit.cshtml"],
        exampleFiles: ["Views/User/Edit.cshtml", "Controllers/UserController.cs"]
      },
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

  assert.match(output, /1\. Views\/User\/Edit.cshtml/);
  assert.match(output, /Pattern fit: HTML form handler \(ui-flow\)\. Mirror the existing form, route, handler, and validation path\. Examples: Views\/User\/Edit\.cshtml\./);
  assert.match(output, /1\. match: user field/);
  assert.doesNotMatch(output, /score 10/);
  assert.doesNotMatch(output, /POSTS_TO: form -> route/);
});

test("renderAgentResponse keeps where-to-add output within a compact agent budget", () => {
  const files = [
    "Web/Services/ProfileSetupService.cs",
    "Web/Areas/Identity/Pages/Account/Register.cshtml.cs",
    "Web/Controllers/ProfileController.cs",
    "Web/Models/ProfileSetupStep.cs",
    "Web/Data/ApplicationUser.cs",
    "Web/Program.cs",
    "Web/Views/Profile/Setup.cshtml"
  ];
  const output = renderAgentResponse({
    query: "add initial profile setup steps after registration",
    answer: "Likely edit locations for \"add initial profile setup steps after registration\" ranked by text matches, feature-flow edges, and detected project patterns.",
    confidence: 0.9,
    files,
    symbols: [],
    relationships: [],
    patterns: [],
    flow: [],
    evidence: files.map((file, index) => ({
      recordType: "fileRecommendation",
      file,
      score: 20 - index,
      reasons: [
        `Search match in record ${file}.`,
        "Participates in CALLS feature-flow evidence.",
        "Follows detected pattern: Controller-service flow."
      ],
      matchedTerms: ["profile", "setup", "registration"],
      patternsToFollow: ["Controller-service flow: follow the existing controller to service path."]
    })),
    nextQueries: files.map((file) => `kraken-atlas query relationships "${file}" --workspace . --context Web --format agent`),
    estimatedContextSavings: "Returns graph records and line ranges instead of full source files."
  } satisfies QueryResponse);

  assert.ok(output.length <= 1400, `Expected compact agent output, got ${output.length} chars:\n${output}`);
  assert.ok(estimatedTokens(output) <= 350, `Expected <=350 estimated tokens, got ${estimatedTokens(output)}`);
  assert.strictEqual(countLinesStartingWith(output, /^(\d+)\. Web\//u), 4);
  assert.strictEqual(countLinesStartingWith(output, /^(\d+)\. match:/u), 4);
  assert.match(output, /1\. Web\/Services\/ProfileSetupService\.cs/);
  assert.match(output, /4\. Web\/Models\/ProfileSetupStep\.cs/);
  assert.doesNotMatch(output, /5\. Web\/Data\/ApplicationUser\.cs/);
  assert.match(output, /Next Commands\n- kraken-atlas query relationships "Web\/Services\/ProfileSetupService\.cs"/);
  assert.doesNotMatch(output, /Web\/Views\/Profile\/Setup\.cshtml/);
});

test("renderAgentResponse formats project metadata as a structured summary", () => {
  const output = renderAgentResponse({
    query: "project",
    answer: "Project metadata summary.",
    confidence: 1,
    files: ["Web/Web.csproj"], symbols: [], relationships: [], patterns: [], flow: [], nextQueries: [],
    evidence: [{
      recordType: "projectSummary",
      workspaceName: "Sample",
      schemaVersion: "0.1.0",
      generatedAt: "2026-06-21T00:00:00.000Z",
      languages: [{ language: "csharp", fileCount: 12 }],
      recordCounts: { files: 12, symbols: 30, relationships: 20, references: 4, patterns: 2 },
      projects: ["Web/Web.csproj"]
    }],
    estimatedContextSavings: "Returns graph records and line ranges instead of full source files."
  } satisfies QueryResponse);

  assert.match(output, /Workspace: Sample; schema 0\.1\.0/);
  assert.match(output, /12 files, 30 symbols, 20 relationships/);
  assert.match(output, /Projects: Web\/Web\.csproj/);
  assert.doesNotMatch(output, /\{"recordType":"projectSummary"/);
});

test("renderAgentResponse formats architecture hotspots as cautious guidance", () => {
  const output = renderAgentResponse({
    query: "hotspots",
    answer: "Found 1 architecture hotspot candidate(s). Treat central files as shared context, not default edit targets.",
    confidence: 0.72,
    files: ["Web/Program.cs"],
    symbols: [],
    relationships: [],
    patterns: [],
    flow: [],
    evidence: [
      {
        recordType: "hotspotSummary",
        message: "Hotspots are ranked from relationship volume, relationship-type diversity, and shared graph endpoints."
      },
      {
        recordType: "architectureHotspot",
        file: "Web/Program.cs",
        role: "composition-root",
        relationshipCount: 12,
        distinctRelationshipTypes: 3,
        sharedEndpointCount: 5,
        topRelationshipTypes: [{ type: "REGISTERS", count: 8 }, { type: "USES_MIDDLEWARE", count: 2 }],
        guidance: "Avoid editing unless the task is explicitly startup, DI, routing, middleware, or shared setup. Use this for architecture context first."
      }
    ],
    nextQueries: ['kraken-atlas query relationships "Web/Program.cs"'],
    estimatedContextSavings: "Returns graph records and line ranges instead of full source files."
  } satisfies QueryResponse);

  assert.match(output, /1\. Web\/Program\.cs/);
  assert.match(output, /Hotspot: Web\/Program\.cs \[composition-root\]; 12 relationship\(s\), 3 type\(s\), 5 shared endpoint\(s\)\. Top: REGISTERS=8, USES_MIDDLEWARE=2\./);
  assert.match(output, /Avoid editing unless the task is explicitly startup, DI, routing, middleware, or shared setup/);
  assert.doesNotMatch(output, /\{"recordType":"architectureHotspot"/);
});

test("renderAgentResponse formats change plans as compact implementation guidance", () => {
  const output = renderAgentResponse({
    query: "add notification preferences",
    answer: "Implementation plan for \"add notification preferences\" with likely edit files, pattern guidance, risk checks, and a bounded context command.",
    confidence: 0.85,
    files: ["Web/Controllers/NotificationController.cs", "Web/Services/NotificationService.cs"],
    symbols: [],
    relationships: [],
    patterns: [],
    flow: [],
    evidence: [
      {
        recordType: "changePlanSummary",
        editFileCount: 2,
        patternFitCount: 1,
        avoidFileCount: 1,
        driftCount: 1,
        message: "Open likely edit files first, copy the local pattern, avoid central files initially."
      },
      {
        recordType: "patternFit",
        patternId: "pattern:aspnet:controller-service-flow",
        patternName: "Controller-service flow",
        category: "feature-flow",
        guidance: "Add endpoint behavior through the existing controller-service pair.",
        matchedFiles: ["Web/Controllers/NotificationController.cs", "Web/Services/NotificationService.cs"]
      },
      {
        recordType: "fileRecommendation",
        file: "Web/Controllers/NotificationController.cs",
        score: 20,
        reasons: ["Search match in symbol notification preferences."]
      },
      {
        recordType: "planAvoidFile",
        file: "Web/Program.cs",
        role: "composition-root",
        reason: "Central/shared hotspot. Inspect only if this change touches shared setup."
      },
      {
        recordType: "finding",
        kind: "pattern-drift",
        title: "Controller bypasses service-layer pattern",
        summary: "A controller relationship directly uses CALLS_REPOSITORY.",
        locations: [{ file: "Web/Controllers/LegacyNotificationController.cs", range: { startLine: 25 } }]
      },
      {
        recordType: "contextPackCommand",
        command: "kraken-atlas context plan-change \"add notification preferences\""
      }
    ],
    nextQueries: ['kraken-atlas context plan-change "add notification preferences"'],
    estimatedContextSavings: "Returns graph records and line ranges instead of full source files."
  } satisfies QueryResponse);

  assert.match(output, /Plan: 2 likely edit file\(s\), 1 pattern fit\(s\), 1 central file\(s\) to avoid initially, 1 drift candidate\(s\)/);
  assert.match(output, /Pattern fit: Controller-service flow/);
  assert.match(output, /Avoid initially: Web\/Program\.cs \[composition-root\]/);
  assert.match(output, /Context pack: kraken-atlas context plan-change/);
  assert.doesNotMatch(output, /\{"recordType":"changePlanSummary"/);
});

test("renderAgentResponse labels code-health findings as review candidates", () => {
  const output = renderAgentResponse({
    query: "orphans", answer: "Found 1 orphan callable candidate(s).", confidence: 0.9,
    files: ["Services/Legacy.cs"], symbols: [], relationships: [], patterns: [], flow: [], nextQueries: [],
    evidence: [
      { recordType: "findingSummary", message: "Verify dynamic and external use before deletion." },
      {
        recordType: "finding", kind: "orphan-callable", title: "Unreferenced private method: Legacy",
        summary: "No mapped incoming call or reference targets this private C# method.",
        locations: [{ file: "Services/Legacy.cs", range: { startLine: 12 } }]
      }
    ],
    estimatedContextSavings: "compact"
  } satisfies QueryResponse);

  assert.match(output, /Candidate: Unreferenced private method: Legacy \[Services\/Legacy\.cs:12\]/);
  assert.match(output, /Verify dynamic and external use before deletion/);
  assert.doesNotMatch(output, /\{"recordType":"finding"/);
});

test("renderAgentResponse labels pattern drift findings separately", () => {
  const output = renderAgentResponse({
    query: "drift", answer: "Found 1 pattern drift candidate(s).", confidence: 0.8,
    files: ["Web/Controllers/AdminController.cs"], symbols: [], relationships: [], patterns: [], flow: [], nextQueries: [],
    evidence: [
      { recordType: "findingSummary", kind: "pattern-drift", message: "Candidates appear to diverge from detected local patterns." },
      {
        recordType: "finding", kind: "pattern-drift", title: "Controller bypasses service-layer pattern",
        summary: "A controller relationship directly uses CALLS_REPOSITORY.",
        locations: [{ file: "Web/Controllers/AdminController.cs", range: { startLine: 42 } }],
        caveats: ["Candidate only."]
      }
    ],
    estimatedContextSavings: "Returns graph records and line ranges instead of full source files."
  } satisfies QueryResponse);

  assert.match(output, /Drift: Controller bypasses service-layer pattern/);
  assert.doesNotMatch(output, /Duplicate: Controller bypasses/);
});

test("renderAgentResponse compacts C# method signatures in relationship evidence", () => {
  const output = renderAgentResponse({
    query: "FormsController",
    answer: "Found 2 relationship edge(s).",
    confidence: 0.9,
    files: ["Web/Controllers/FormsController.cs"],
    symbols: [],
    relationships: [
      {
        type: "CALLS",
        from: "symbol:csharp:Web.Controllers.FormsController.ImageUpload(IFormFile, string, string, long, string, int, int, System.Threading.CancellationToken)",
        to: "symbol:csharp:Web.Controllers.FormsController.ForwardCookies(System.Net.Http.HttpRequestMessage)",
        fromLocation: {
          file: "Web/Controllers/FormsController.cs",
          range: { startLine: 40, startColumn: 3, endLine: 40, endColumn: 20 }
        },
        toLocation: {
          file: "Web/Controllers/FormsController.cs",
          range: { startLine: 88, startColumn: 3, endLine: 88, endColumn: 20 }
        },
        file: "Web/Controllers/FormsController.cs",
        range: { startLine: 42, startColumn: 1, endLine: 42, endColumn: 20 },
        evidence: "ForwardCookies(request)"
      }
    ],
    patterns: [],
    flow: [],
    evidence: [],
    nextQueries: [],
    estimatedContextSavings: "Returns graph records and line ranges instead of full source files."
  } satisfies QueryResponse);

  assert.match(output, /FormsController\.ImageUpload\(\.\.\.\) -> FormsController\.ForwardCookies\(\.\.\.\)/);
  assert.match(output, /\[nodes: Web\/Controllers\/FormsController\.cs:40 -> Web\/Controllers\/FormsController\.cs:88\]/);
  assert.doesNotMatch(output, /IFormFile, string, string, long/);
  assert.doesNotMatch(output, /System\.Threading\.CancellationToken/);
});

test("renderAgentResponse formats relationship filters without raw JSON", () => {
  const output = renderAgentResponse({
    query: "map.js",
    answer: "Found 2 relationship edge(s) filtered to READS_QUERY_STRING, CONTAINS.",
    confidence: 0.9,
    files: ["Web/wwwroot/js/map.js"],
    symbols: [],
    relationships: [{
      type: "READS_QUERY_STRING",
      from: "symbol:javascript:Web/wwwroot/js/map.js:read",
      to: "browser-state:query-string",
      file: "Web/wwwroot/js/map.js",
      range: { startLine: 10, startColumn: 1, endLine: 10, endColumn: 20 }
    }],
    patterns: [],
    flow: [],
    evidence: [{
      recordType: "relationshipFilter",
      edgeTypes: ["READS_QUERY_STRING", "CONTAINS"],
      message: "Showing only relationship types: READS_QUERY_STRING, CONTAINS."
    }],
    nextQueries: [],
    estimatedContextSavings: "Compact graph output."
  });

  assert.match(output, /Filter: READS_QUERY_STRING, CONTAINS/);
  assert.doesNotMatch(output, /\{"recordType":"relationshipFilter"/);
});

test("renderAgentResponse renders search references and reference breakdowns", () => {
  const searchOutput = renderAgentResponse({
    query: "ITranslationService",
    answer: "Found 1 search result(s).",
    confidence: 0.7,
    files: ["Views/Shared/_Layout.cshtml"],
    symbols: [],
    relationships: [],
    patterns: [],
    flow: [],
    evidence: [{
      recordId: "reference:web:Views/Shared/_Layout.cshtml:5:ITranslationService",
      recordType: "reference",
      title: "ITranslationService",
      path: "Views/Shared/_Layout.cshtml",
      line: 5,
      matchKind: "razor-inject",
      snippet: "@inject ITranslationService TranslationService"
    }],
    nextQueries: [],
    estimatedContextSavings: "Compact graph output."
  });
  assert.match(searchOutput, /razor-inject: ITranslationService \(Views\/Shared\/_Layout\.cshtml:5\)/);
  assert.match(searchOutput, /@inject ITranslationService/);
  assert.doesNotMatch(searchOutput, /Reference:  ->/);

  const referenceOutput = renderAgentResponse({
    query: "ITranslationService",
    answer: "Found 2 source reference(s) and 4 connected relationship edge(s).",
    confidence: 0.88,
    files: ["Services/ITranslationService.cs"],
    symbols: [],
    relationships: [],
    patterns: [],
    flow: [],
    evidence: [{
      recordType: "referenceSummary",
      resolvedAnchorCount: 2,
      sourceReferenceKinds: { "razor-inject": 1, "razor-injected-call": 1 },
      relationshipTypes: { IMPLEMENTS: 1, REGISTERS: 1, RAZOR_INJECTS: 1, CALLS_INJECTED_SERVICE: 1 }
    }],
    nextQueries: [],
    estimatedContextSavings: "Compact graph output."
  });
  assert.match(referenceOutput, /Breakdown: source razor-inject=1, razor-injected-call=1/);
  assert.match(referenceOutput, /CALLS_INJECTED_SERVICE=1/);
  assert.match(referenceOutput, /anchors 2\. Evidence is sampled; exact single-ID follow-ups may differ/);
});

test("renderAgentResponse labels search sampling and context expansion", () => {
  const output = renderAgentResponse({
    query: "ITranslationService",
    answer: "Showing 20 ranked search result(s).",
    confidence: 0.7,
    files: ["Web/Program.cs"],
    symbols: [],
    relationships: [],
    patterns: [],
    flow: [],
    evidence: [
      { recordType: "searchSummary", message: "Showing 20 of at least 80 matched candidates; compact evidence is sampled." },
      { recordType: "contextExpansion", message: "Included 1 directly connected edge(s) outside seed context Web: IMPLEMENTS=1." }
    ],
    nextQueries: [],
    estimatedContextSavings: "Compact graph output."
  });
  assert.match(output, /Sampling: Showing 20 of at least 80 matched candidates/);
  assert.match(output, /Context expansion: Included 1 directly connected edge/);
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

function estimatedTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

function countLinesStartingWith(value: string, pattern: RegExp): number {
  return value.split(/\r?\n/u).filter((line) => pattern.test(line)).length;
}
