import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { renderContextPack } from "../src/context/agentContext";
import { renderAgentResponse } from "../src/format/agentFormatter";
import { FileRecord, PatternRecord, ReferenceRecord, RelationshipRecord, SymbolRecord } from "../src/model/records";
import { buildContextPruningResult } from "../src/query/queryContextPruning";
import { QueryService } from "../src/query/queryService";
import type { FileRecommendation } from "../src/query/whereToAddRanking";
import { openSqliteIndex, rebuildSqliteIndex } from "../src/storage/sqliteIndex";
import { fileRecord, range, stringValue } from "../test-support/queryTestHelpers";

test("where-to-add ranks feature-specific form files before base controllers and composition roots", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-query-ranking-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const files: FileRecord[] = [
    {
      recordType: "file",
      id: "file:Web/Controllers/ProfileController.cs",
      path: "Web/Controllers/ProfileController.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "a".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source", "controller"]
    },
    {
      recordType: "file",
      id: "file:Web/Controllers/ProfileControllerBase.cs",
      path: "Web/Controllers/ProfileControllerBase.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "b".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source", "controller"]
    },
    {
      recordType: "file",
      id: "file:Web/Program.cs",
      path: "Web/Program.cs",
      extension: ".cs",
      language: "csharp",
      sizeBytes: 100,
      sha256: "c".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["csharp", "source"]
    },
    {
      recordType: "file",
      id: "file:Web/Views/Profile/Edit.cshtml",
      path: "Web/Views/Profile/Edit.cshtml",
      extension: ".cshtml",
      language: "razor",
      sizeBytes: 100,
      sha256: "d".repeat(64),
      modifiedTimeUtc: "2026-06-11T00:00:00.000Z",
      isGenerated: false,
      tags: ["razor", "source", "view"]
    }
  ];
  const symbols: SymbolRecord[] = [
    {
      recordType: "symbol",
      id: "symbol:csharp:Web.Controllers.ProfileController.Save(ProfileRequest)",
      name: "Save",
      fullyQualifiedName: "Web.Controllers.ProfileController.Save",
      kind: "method",
      language: "csharp",
      file: "Web/Controllers/ProfileController.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:Web.Controllers.ProfileControllerBase.ResolveProfileRequest(string)",
      name: "ResolveProfileRequest",
      fullyQualifiedName: "Web.Controllers.ProfileControllerBase.ResolveProfileRequest",
      kind: "method",
      language: "csharp",
      file: "Web/Controllers/ProfileControllerBase.cs",
      range: range(),
      confidence: 1
    }
  ];
  const relationships: RelationshipRecord[] = [
    {
      recordType: "relationship",
      id: "relationship:auth:web:profile",
      from: "symbol:csharp:Web.Controllers.ProfileController.Save(ProfileRequest)",
      to: "auth:csharp:policy:CanEditProfile",
      type: "REQUIRES_AUTH",
      file: "Web/Controllers/ProfileController.cs",
      range: range(),
      evidence: "Validate and save profile request",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:calls:web:profile-base",
      from: "symbol:csharp:Web.Controllers.ProfileControllerBase.ResolveProfileRequest(string)",
      to: "symbol:csharp:string.Trim()",
      type: "CALLS",
      file: "Web/Controllers/ProfileControllerBase.cs",
      range: range(),
      evidence: "Resolve generic request",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:maps:web:profile",
      from: "route:csharp:/profile/save",
      to: "symbol:csharp:Web.Controllers.ProfileController.Save(ProfileRequest)",
      type: "MAPS_ROUTE",
      file: "Web/Program.cs",
      range: range(),
      evidence: "Map profile route",
      confidence: 0.9
    },
    {
      recordType: "relationship",
      id: "relationship:posts:web:profile",
      from: "symbol:razor:Web/Views/Profile/Edit.cshtml:form:profile-form",
      to: "route:csharp:/profile/save",
      type: "POSTS_TO",
      file: "Web/Views/Profile/Edit.cshtml",
      range: range(),
      evidence: "profile-form posts profile request",
      confidence: 0.9
    }
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols, relationships, patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const result = new QueryService(database, { projectContext: "Web" }).whereToAdd("add validation for profile request");

    assert.ok(result.files.includes("Web/Controllers/ProfileController.cs"));
    assert.ok(result.files.includes("Web/Views/Profile/Edit.cshtml"));
    if (result.files.includes("Web/Controllers/ProfileControllerBase.cs")) {
      assert.ok(result.files.indexOf("Web/Controllers/ProfileController.cs") < result.files.indexOf("Web/Controllers/ProfileControllerBase.cs"));
    }
    if (result.files.includes("Web/Program.cs")) {
      assert.ok(result.files.indexOf("Web/Controllers/ProfileController.cs") < result.files.indexOf("Web/Program.cs"));
    }
  } finally {
    database.close();
  }
});
test("where-to-add carries matched node tags into recommendations and context packs", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-node-tag-ranking-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const requestId = "symbol:csharp:KelpApiDomain.SavePageDraftRequest";
  const files: FileRecord[] = [
    fileRecord("Kelp2025_WebUI/Services/Content/ContentEditorAdapter.cs"),
    fileRecord("KelpApiDomain/ViewModels/Pages/PageDraftModels.cs")
  ];
  const symbols: SymbolRecord[] = [
    {
      recordType: "symbol",
      id: "symbol:csharp:Kelp2025_WebUI.Services.Content.ContentEditorAdapter.BuildRequest()",
      name: "BuildRequest",
      fullyQualifiedName: "Kelp2025_WebUI.Services.Content.ContentEditorAdapter.BuildRequest",
      kind: "method",
      language: "csharp",
      file: "Kelp2025_WebUI/Services/Content/ContentEditorAdapter.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: requestId,
      name: "SavePageDraftRequest",
      fullyQualifiedName: "KelpApiDomain.SavePageDraftRequest",
      kind: "class",
      language: "csharp",
      file: "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.MetaDescription",
      name: "MetaDescription",
      fullyQualifiedName: "KelpApiDomain.SavePageDraftRequest.MetaDescription",
      kind: "property",
      language: "csharp",
      file: "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs",
      range: range(),
      confidence: 1
    }
  ];
  const relationships: RelationshipRecord[] = [{
    recordType: "relationship",
    id: "relationship:maps-property:page-draft-meta-description",
    from: "symbol:csharp:Kelp2025_WebUI.Services.Content.ContentEditorAdapter.BuildRequest()",
    to: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.MetaDescription",
    type: "MAPS_PROPERTY",
    file: "Kelp2025_WebUI/Services/Content/ContentEditorAdapter.cs",
    range: range(),
    evidence: "MetaDescription = input.MetaDescription",
    confidence: 0.88
  }];

  await rebuildSqliteIndex(indexPath, { files, symbols, relationships, references: [], patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const service = new QueryService(database, { projectContext: "Kelp2025_WebUI" });
    const result = service.whereToAdd("add meta description to page draft");
    const recommendation = result.evidence.find((item) =>
      item.recordType === "fileRecommendation" &&
      item.file === "Kelp2025_WebUI/Services/Content/ContentEditorAdapter.cs"
    );

    assert.ok(recommendation);
    const matchedTags = Array.isArray(recommendation?.matchedTags) ? recommendation.matchedTags : [];
    const reasons = Array.isArray(recommendation?.reasons) ? recommendation.reasons : [];
    assert.ok(matchedTags.includes("page-draft"));
    assert.ok(matchedTags.includes("meta-description"));
    assert.ok(reasons.some((reason) => typeof reason === "string" && reason.startsWith("Node tag match:")));

    const plan = service.planChange("add meta description to page draft");
    const planRecommendation = plan.evidence.find((item) =>
      item.recordType === "fileRecommendation" &&
      item.file === "Kelp2025_WebUI/Services/Content/ContentEditorAdapter.cs"
    );
    const planMatchedTags = Array.isArray(planRecommendation?.matchedTags) ? planRecommendation.matchedTags : [];
    assert.ok(planMatchedTags.includes("page-draft"));
    const contextPack = renderContextPack(plan);
    assert.match(contextPack, /Node tags: .*page-draft/);
    assert.match(contextPack, /Node tags: .*meta-description/);
  } finally {
    database.close();
  }
});

test("where-to-add warns when a requested field touches a shared request DTO", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-shared-contract-warning-"));
  const indexPath = path.join(root, ".kraken-atlas", "index.sqlite");
  const requestId = "symbol:csharp:KelpApiDomain.SavePageDraftRequest";
  const files: FileRecord[] = [
    fileRecord("KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"),
    fileRecord("Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs"),
    fileRecord("KelpApi/Controllers/PageController.cs")
  ];
  const symbols: SymbolRecord[] = [
    {
      recordType: "symbol",
      id: requestId,
      name: "SavePageDraftRequest",
      fullyQualifiedName: "KelpApiDomain.SavePageDraftRequest",
      kind: "class",
      language: "csharp",
      file: "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.PageTitle",
      name: "PageTitle",
      fullyQualifiedName: "KelpApiDomain.SavePageDraftRequest.PageTitle",
      kind: "property",
      language: "csharp",
      file: "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.MetaDescription",
      name: "MetaDescription",
      fullyQualifiedName: "KelpApiDomain.SavePageDraftRequest.MetaDescription",
      kind: "property",
      language: "csharp",
      file: "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:Kelp2025_WebUI.Services.ComposableContent.PageComposableContentEditorAdapter.BuildRequest()",
      name: "BuildRequest",
      fullyQualifiedName: "Kelp2025_WebUI.Services.ComposableContent.PageComposableContentEditorAdapter.BuildRequest",
      kind: "method",
      language: "csharp",
      file: "Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs",
      range: range(),
      confidence: 1
    },
    {
      recordType: "symbol",
      id: "symbol:csharp:KelpApi.Controllers.PageController.SaveDraft(KelpApiDomain.SavePageDraftRequest)",
      name: "SaveDraft",
      fullyQualifiedName: "KelpApi.Controllers.PageController.SaveDraft",
      kind: "method",
      language: "csharp",
      file: "KelpApi/Controllers/PageController.cs",
      range: range(),
      confidence: 1
    }
  ];
  const references: ReferenceRecord[] = [
    {
      recordType: "reference",
      id: "reference:csharp:webui-save-page-draft",
      symbolName: "SavePageDraftRequest",
      resolvedSymbolId: requestId,
      file: "Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs",
      range: range(),
      context: "type-usage",
      snippet: "new SavePageDraftRequest",
      confidence: 0.9
    },
    {
      recordType: "reference",
      id: "reference:csharp:api-save-page-draft",
      symbolName: "SavePageDraftRequest",
      resolvedSymbolId: requestId,
      file: "KelpApi/Controllers/PageController.cs",
      range: range(),
      context: "parameter",
      snippet: "SavePageDraftRequest request",
      confidence: 0.9
    }
  ];
  const relationships: RelationshipRecord[] = [
    {
      recordType: "relationship",
      id: "relationship:maps-property:save-page-draft-title",
      from: "symbol:csharp:Kelp2025_WebUI.Services.ComposableContent.PageComposableContentEditorAdapter.BuildRequest()",
      to: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.PageTitle",
      type: "MAPS_PROPERTY",
      file: "Kelp2025_WebUI/Services/ComposableContent/PageComposableContentEditorAdapter.cs",
      range: range(),
      evidence: "PageTitle = model.PageTitle",
      confidence: 0.82
    },
    {
      recordType: "relationship",
      id: "relationship:handles-request:save-page-draft",
      from: "symbol:csharp:KelpApi.Controllers.PageController.SaveDraft(KelpApiDomain.SavePageDraftRequest)",
      to: requestId,
      type: "HANDLES_REQUEST",
      file: "KelpApi/Controllers/PageController.cs",
      range: range(),
      evidence: "SaveDraft(SavePageDraftRequest request)",
      confidence: 0.88
    }
  ];

  await rebuildSqliteIndex(indexPath, { files, symbols, references, relationships, patterns: [] });
  const database = await openSqliteIndex(indexPath);
  try {
    const service = new QueryService(database, { projectContext: "Kelp2025_WebUI" });
    const where = service.whereToAdd("add field to shared page draft request");
    const boundary = where.evidence.find((item) => item.recordType === "sharedContractBoundary");

    assert.ok(boundary);
    assert.strictEqual(boundary.nodeId, requestId);
    assert.deepStrictEqual(boundary.declaredIn, { KelpApiDomain: 1 });
    assert.ok(Array.isArray(boundary.roles) && boundary.roles.includes("request-dto"));
    assert.ok(Array.isArray(boundary.usedFrom) && boundary.usedFrom.includes("Kelp2025_WebUI"));
    assert.ok(Array.isArray(boundary.usedFrom) && boundary.usedFrom.includes("KelpApi"));
    assert.ok(Array.isArray(boundary.members) && boundary.members.includes("PageTitle"));
    const contractRecommendation = where.evidence.find((item) =>
      item.recordType === "fileRecommendation" &&
      item.file === "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"
    );
    const contractRoles = Array.isArray(contractRecommendation?.symbolRoles) ? contractRecommendation.symbolRoles : [];
    const contractMembers = Array.isArray(contractRecommendation?.memberHints) ? contractRecommendation.memberHints as Array<Record<string, unknown>> : [];
    assert.ok(contractRecommendation);
    assert.ok(contractRoles.includes("request-dto"));
    assert.strictEqual((contractRecommendation?.projectHint as Record<string, unknown> | undefined)?.project, "KelpApiDomain");
    assert.ok(contractMembers.some((member) => member.name === "PageTitle"));

    const agentOutput = renderAgentResponse(where);
    assert.match(agentOutput, /Shared contract:/);
    assert.match(agentOutput, /SavePageDraftRequest/);
    assert.match(agentOutput, /members .*PageTitle/);

    const plan = service.planChange("add field to shared page draft request");
    assert.ok(plan.evidence.some((item) => item.recordType === "sharedContractBoundary" && item.nodeId === requestId));
    const checklist = plan.evidence.find((item) => item.recordType === "sharedContractChecklist" && item.nodeId === requestId);
    const checklistItems = Array.isArray(checklist?.items) ? checklist.items as Array<Record<string, unknown>> : [];
    assert.ok(checklist);
    assert.ok(checklistItems.some((item) => item.area === "contract"));
    assert.ok(checklistItems.some((item) => item.area === "mapping"));
    assert.ok(checklistItems.some((item) => item.area === "api-handler"));
    assert.ok(checklistItems.some((item) => item.area === "validation"));
    assert.ok(checklistItems.some((item) => item.area === "client-or-serialization"));
    assert.ok(checklistItems.some((item) => item.area === "tests"));
    assert.ok(plan.files.includes("KelpApiDomain/ViewModels/Pages/PageDraftModels.cs"));

    const planOutput = renderAgentResponse(plan);
    assert.match(planOutput, /Contract checklist:/);
    assert.match(planOutput, /Contract shape/);

    const contextPack = renderContextPack(plan);
    assert.match(contextPack, /Shared Contract Boundaries/);
    assert.match(contextPack, /Shared Contract Checklist/);
    assert.match(contextPack, /Client\/serialization impact/);
    assert.match(contextPack, /Guidance: project KelpApiDomain; roles .*request-dto/);
    assert.match(contextPack, /Members: SavePageDraftRequest\.PageTitle/);
  } finally {
    database.close();
  }
});

test("context pruning keeps selected tag and project relationships while dropping adjacent noise", () => {
  const requestId = "symbol:csharp:KelpApiDomain.SavePageDraftRequest";
  const recommendations: FileRecommendation[] = [{
    recordType: "fileRecommendation",
    file: "Kelp2025_WebUI/Services/PageDraftAdapter.cs",
    score: 20,
    reasons: [],
    matchedTerms: ["page", "draft"],
    matchedTags: ["page-draft"],
    patternsToFollow: [],
    relationshipEvidenceCount: 1,
    searchEvidenceCount: 0,
    relationshipDetails: [],
    anchorDetails: []
  }];
  const boundaries = [{
    recordType: "sharedContractBoundary",
    nodeId: requestId,
    name: "SavePageDraftRequest",
    file: "KelpApiDomain/ViewModels/Pages/PageDraftModels.cs",
    projects: ["KelpApiDomain", "Kelp2025_WebUI", "KelpApi"],
    usedFrom: ["Kelp2025_WebUI", "KelpApi"]
  }];
  const relationships = [
    {
      id: "relationship:maps:page-draft",
      type: "MAPS_PROPERTY",
      from: "symbol:csharp:Kelp2025_WebUI.Services.PageDraftAdapter.BuildRequest()",
      to: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.PageTitle",
      file: "Kelp2025_WebUI/Services/PageDraftAdapter.cs"
    },
    {
      id: "relationship:handles:page-draft",
      type: "HANDLES_REQUEST",
      from: "symbol:csharp:KelpApi.Controllers.PageController.SaveDraft(KelpApiDomain.SavePageDraftRequest)",
      to: requestId,
      file: "KelpApi/Controllers/PageController.cs"
    },
    {
      id: "relationship:maps:admin-report",
      type: "MAPS_PROPERTY",
      from: "symbol:csharp:AdminTools.Services.ReportAdapter.BuildRequest()",
      to: "symbol:csharp:AdminTools.Contracts.AdminReportRequest.Title",
      file: "AdminTools/Services/ReportAdapter.cs"
    },
    {
      id: "relationship:calls:identity-email-store",
      type: "CALLS",
      from: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.ExternalLoginModel.ExternalLoginModel()",
      to: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.ExternalLoginModel.GetEmailStore()",
      file: "Kelp2025_WebUI/Areas/Identity/Pages/Account/ExternalLogin.cshtml.cs"
    }
  ];

  const result = buildContextPruningResult(
    "add field to shared page draft request",
    ["KelpApiDomain/ViewModels/Pages/PageDraftModels.cs", "Kelp2025_WebUI/Services/PageDraftAdapter.cs"],
    recommendations,
    boundaries,
    relationships,
    [
      { nodeId: requestId, tag: "page-draft" },
      { nodeId: "symbol:csharp:KelpApiDomain.SavePageDraftRequest.PageTitle", tag: "page-draft" },
      { nodeId: "symbol:csharp:AdminTools.Contracts.AdminReportRequest.Title", tag: "admin-report" },
      { nodeId: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.ExternalLoginModel", tag: "pages" },
      { nodeId: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.ExternalLoginModel.GetEmailStore", tag: "identity-pages-account" }
    ],
    [
      { nodeId: requestId, project: "KelpApiDomain" },
      { nodeId: requestId, project: "Kelp2025_WebUI" },
      { nodeId: requestId, project: "KelpApi" },
      { nodeId: "symbol:csharp:AdminTools.Contracts.AdminReportRequest.Title", project: "AdminTools" },
      { nodeId: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.ExternalLoginModel", project: "Kelp2025_WebUI" },
      { nodeId: "symbol:csharp:Kelp2025_WebUI.Areas.Identity.Pages.Account.ExternalLoginModel.GetEmailStore", project: "Kelp2025_WebUI" }
    ]
  );

  assert.deepStrictEqual(result.relationships.map((relationship) => relationship.id), [
    "relationship:maps:page-draft",
    "relationship:handles:page-draft"
  ]);
  assert.strictEqual(result.evidence[0]?.recordType, "contextPruning");
  assert.strictEqual(result.evidence[0]?.originalRelationshipCount, 4);
  assert.strictEqual(result.evidence[0]?.keptRelationshipCount, 2);
  assert.ok(Array.isArray(result.evidence[0]?.tags) && result.evidence[0].tags.includes("page-draft"));
});
