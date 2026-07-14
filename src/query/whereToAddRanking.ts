import { hasPathSegment, isLikelyTestFile } from "./queryPath";
import { relationshipWeight, strongAnchorRoleBoost } from "./queryScoring";
import { hasIncompleteBrowserQueryState } from "./queryFlow";
import {
  domainFlowTerms,
  queryCoreTerms,
  queryTerms,
  queryWantsBrowserQueryState,
  queryWantsBrowserQueryWrite,
  queryWantsCompositionRoot,
  queryWantsFormOrProfile,
  queryWantsIdentityAccountFlow,
  queryWantsIdentityUserShape,
  queryWantsTemplateBackedDetail,
  queryWantsValidationOrAuth
} from "./queryText";
import { numberValue, stringValue, uniqueStrings } from "./queryUtils";

export interface FileRecommendation extends Record<string, unknown> {
  recordType: "fileRecommendation";
  file: string;
  score: number;
  reasons: string[];
  matchedTerms: string[];
  matchedTags?: string[];
  nodeTags?: Array<{ tag: string; confidence: number; sources: string[] }>;
  nodeRoles?: string[];
  projectHint?: { project?: string; projects: string[] };
  memberHints?: Array<{ owner: string; name: string; typeName?: string; required?: boolean; nullable?: boolean }>;
  symbolRoles?: string[];
  patternsToFollow: string[];
  relationshipEvidenceCount: number;
  searchEvidenceCount: number;
  relationshipDetails: Array<Record<string, unknown>>;
  anchorDetails: Array<Record<string, unknown>>;
}

export function rankFileRecommendations(
  query: string,
  searchRows: Array<Record<string, unknown>>,
  relationships: Array<Record<string, unknown>>,
  patterns: Array<Record<string, unknown>>,
  strongAnchors: Array<Record<string, unknown>> = []
): FileRecommendation[] {
  const terms = queryTerms(query);
  const coreTerms = queryCoreTerms(query);
  const wantsTemplateBackedDetail = queryWantsTemplateBackedDetail(query.toLowerCase());
  const recommendations = new Map<string, FileRecommendation>();
  const searchHitCounts = new Map<string, number>();
  const anchorHitCounts = new Map<string, number>();

  for (const anchor of strongAnchors) {
    const file = stringValue(anchor.file);
    if (!file) {
      continue;
    }

    const recommendation = getRecommendation(recommendations, file);
    recommendation.strongAnchor = genericBaseTypePenalty(file, query) === 0;
    const matchedConcepts = Array.isArray(anchor.matchedConcepts)
      ? anchor.matchedConcepts.filter((term): term is string => typeof term === "string")
      : [];
    const previousAnchors = anchorHitCounts.get(file) ?? 0;
    anchorHitCounts.set(file, previousAnchors + 1);
    recommendation.score += previousAnchors === 0
      ? 25 + matchedConcepts.length * 2 + strongAnchorRoleBoost(anchor)
      : 3;
    addRecommendationReason(recommendation, `Strong symbol anchor: ${stringValue(anchor.name) || stringValue(anchor.id)}.`);
    recommendation.anchorDetails.push({ id: anchor.id, name: anchor.name, file: anchor.file, range: anchor.range });
    addTerms(recommendation, matchedConcepts);
  }

  for (const row of searchRows) {
    const file = stringValue(row.path);
    if (!file) {
      continue;
    }

    const recommendation = getRecommendation(recommendations, file);
    const haystack = [row.title, row.body, row.path].map(stringValue).join(" ").toLowerCase();
    const matchedTerms = terms.filter((term) => haystack.includes(term));
    const previousHits = searchHitCounts.get(file) ?? 0;
    searchHitCounts.set(file, previousHits + 1);
    recommendation.searchEvidenceCount += 1;
    recommendation.score += previousHits === 0 ? 3 + matchedTerms.length : Math.min(2, 0.75 + matchedTerms.length * 0.25);
    addRecommendationReason(recommendation, `Search ${stringValue(row.recordType) || "record"}: ${stringValue(row.title) || stringValue(row.recordId)}${matchedTerms.length ? `; matched ${matchedTerms.join(", ")}` : ""}.`);
    addTerms(recommendation, matchedTerms);
  }

  for (const relationship of relationships) {
    const file = stringValue(relationship.file);
    if (!file) {
      continue;
    }

    const recommendation = getRecommendation(recommendations, file);
    const type = stringValue(relationship.type);
    recommendation.score += relationshipWeight(type);
    recommendation.relationshipEvidenceCount += 1;
    recommendation.relationshipDetails.push({
      type: relationship.type,
      from: relationship.from,
      to: relationship.to,
      file: relationship.file,
      range: relationship.range
    });
    addRecommendationReason(recommendation, relationshipRecommendationReason(relationship));
    addTerms(recommendation, terms.filter((term) => JSON.stringify(relationship).toLowerCase().includes(term)));
  }

  for (const pattern of patterns) {
    const patternName = stringValue(pattern.name) || stringValue(pattern.id);
    const instances = Array.isArray(pattern.instances) ? pattern.instances as Array<Record<string, unknown>> : [];
    for (const instance of instances) {
      const files = Array.isArray(instance.files) ? instance.files.filter((file): file is string => typeof file === "string") : [];
      const instanceHaystack = JSON.stringify(instance).toLowerCase();
      for (const file of files) {
        if (!recommendations.has(file) && terms.length > 0 && !textMatchesAnyTerm(`${file} ${instanceHaystack}`, terms)) {
          continue;
        }

        const recommendation = getRecommendation(recommendations, file);
        recommendation.score += 3 + numberValue(pattern.confidence) * 2;
        addRecommendationReason(recommendation, `Follows detected pattern: ${patternName}.`);
        addPattern(recommendation, `${patternName}: ${stringValue(pattern.agentGuidance)}`);
      }
    }
  }

  for (const recommendation of recommendations.values()) {
    const distinctCoreMatches = coreTerms.filter((term) => recommendation.matchedTerms.includes(term)).length;
    recommendation.score += distinctCoreMatches * 2.5 + (distinctCoreMatches >= 3 ? 4 : 0);
    recommendation.score += roleWeight(recommendation.file, query);
    if (wantsTemplateBackedDetail && recommendation.strongAnchor) {
      recommendation.strongAnchor = false;
    }
    const compositionPenalty = compositionRootPenalty(recommendation.file, query);
    if (compositionPenalty > 0) {
      recommendation.score -= compositionPenalty;
      addRecommendationReason(recommendation, "Composition root; inspect only when the request is about startup, DI, routing, middleware, or config.");
    }
    if (isLikelyTestFile(recommendation.file)) {
      recommendation.score -= 3;
      addRecommendationReason(recommendation, "Likely test file; use for validation unless the requested change is test-specific.");
    }
    const baseTypePenalty = genericBaseTypePenalty(recommendation.file, query);
    if (baseTypePenalty > 0) {
      recommendation.score -= baseTypePenalty;
      addRecommendationReason(recommendation, "Shared base type; inspect after the feature-specific controller, view, model, or service unless changing shared behavior.");
    }
    sortRecommendationReasons(recommendation);
    recommendation.patternsToFollow = recommendation.patternsToFollow.slice(0, 3);
    recommendation.matchedTerms = recommendation.matchedTerms.slice(0, 8);
  }

  return [...recommendations.values()]
    .filter((recommendation) => recommendation.score > 0)
    .filter((recommendation) => Boolean(recommendation.strongAnchor) || recommendation.relationshipEvidenceCount > 0 || recommendation.searchEvidenceCount > 0)
    .filter((recommendation) => !/(^|\/)PageController\.cs$/i.test(recommendation.file) || recommendation.relationshipEvidenceCount > 0)
    .sort((left, right) => Number(Boolean(right.strongAnchor)) - Number(Boolean(left.strongAnchor)) || right.score - left.score || left.file.localeCompare(right.file));
}

export function buildWhereToAddCaveats(query: string, recommendations: FileRecommendation[], relationships: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const caveats: Array<Record<string, unknown>> = [];
  if (isBroadWhereToAddQuery(query)) {
    caveats.push({
      recordType: "caveat",
      message: "Query is broad. Treat these as starting points and retry with a specific feature, field, route, error, or UI action before editing."
    });
  }

  if (recommendations.length === 0) {
    caveats.push({
      recordType: "caveat",
      message: "No high-confidence edit location found. Run broader project and search queries before editing."
    });
  }

  if (queryWantsTemplateBackedDetail(query.toLowerCase())) {
    caveats.push({
      recordType: "caveat",
      message: "Template-backed profile detail request: prefer admin/object-type/template configuration first; runtime PersonaInfo files usually render existing detail templates."
    });
  }

  if (!hasConnectedFeatureEvidence(relationships)) {
    caveats.push({
      recordType: "caveat",
      message: "No connected controller/UI/service flow was found. Treat recommendations as text-and-pattern hints, not a complete feature path."
    });
  }

  const generatedFiles = recommendations.filter((recommendation) => /(^|\/)(bin|obj|dist|build|generated)(\/|$)/i.test(recommendation.file));
  if (generatedFiles.length > 0) {
    caveats.push({
      recordType: "caveat",
      message: `Avoid editing generated/build outputs: ${generatedFiles.map((file) => file.file).join(", ")}.`
    });
  }

  if (hasIncompleteBrowserQueryState(query, relationships)) {
    caveats.push({
      recordType: "caveat",
      message: "Query-string read behavior was found, but no query-string write edge was detected. Treat this as an incomplete browser-state lifecycle and inspect the top JavaScript file before editing."
    });
  }

  return caveats;
}

export function includeViewSurfaceRecommendation(query: string, selected: FileRecommendation[], candidates: FileRecommendation[]): FileRecommendation[] {
  if (!/\b(field|form|ui|view|page)\b/iu.test(query) || selected.some((recommendation) => isViewSurfaceFile(recommendation.file))) {
    return selected;
  }

  const viewCandidate = candidates.find((recommendation) =>
    isViewSurfaceFile(recommendation.file) &&
    (recommendation.relationshipEvidenceCount > 0 || recommendation.searchEvidenceCount > 0)
  );
  if (!viewCandidate) {
    return selected;
  }

  return selected.length < 8
    ? [...selected, viewCandidate]
    : [...selected.slice(0, 7), viewCandidate];
}

export function buildPatternFitEvidence(query: string, patterns: Array<Record<string, unknown>>, recommendations: FileRecommendation[]): Array<Record<string, unknown>> {
  if (!patterns.length || !recommendations.length) {
    return [];
  }

  const recommendedFiles = new Set(recommendations.map((recommendation) => recommendation.file));
  const wantsTemplateBackedDetail = queryWantsTemplateBackedDetail(query.toLowerCase());
  const ranked = patterns
    .map((pattern) => {
      const instances = Array.isArray(pattern.instances) ? pattern.instances as Array<Record<string, unknown>> : [];
      const exampleFiles = uniqueStrings(instances.flatMap((instance) =>
        Array.isArray(instance.files) ? instance.files.filter((file): file is string => typeof file === "string") : []
      ));
      const matchedFiles = exampleFiles.filter((file) => recommendedFiles.has(file));
      const sourceOfTruthBoost = wantsTemplateBackedDetail && pattern.id === "pattern:data:template-backed-runtime-field" ? 30 : 0;
      const score = matchedFiles.length * 10 + numberValue(pattern.confidence) * 3 + Math.min(3, numberValue(pattern.frequency)) + sourceOfTruthBoost;
      return { pattern, exampleFiles, matchedFiles, score };
    })
    .filter((entry) => entry.exampleFiles.length > 0)
    .sort((left, right) =>
      right.score - left.score ||
      numberValue(right.pattern.confidence) - numberValue(left.pattern.confidence) ||
      stringValue(left.pattern.name).localeCompare(stringValue(right.pattern.name))
    );

  const best = ranked[0];
  if (!best) {
    return [];
  }

  return [{
    recordType: "patternFit",
    patternId: best.pattern.id,
    patternName: best.pattern.name,
    category: best.pattern.category,
    confidence: best.pattern.confidence,
    frequency: best.pattern.frequency,
    guidance: best.pattern.agentGuidance,
    matchedFiles: best.matchedFiles.slice(0, 5),
    exampleFiles: best.exampleFiles.slice(0, 5),
    message: best.matchedFiles.length
      ? `Recommended files overlap the ${stringValue(best.pattern.name) || "detected"} pattern.`
      : `Closest detected pattern is ${stringValue(best.pattern.name) || stringValue(best.pattern.id)}.`
  }];
}

export function calculateWhereToAddConfidence(query: string, recommendations: FileRecommendation[], relationships: Array<Record<string, unknown>>): number {
  if (recommendations.length === 0) {
    return 0.2;
  }

  const terms = queryCoreTerms(query);
  const matched = new Set(recommendations[0].matchedTerms);
  const coveredTerms = terms.filter((term) => matched.has(term));
  const coverage = terms.length ? coveredTerms.length / terms.length : 0;
  let confidence = 0.4 + Math.min(0.25, recommendations[0].score / 50);

  if (coverage >= 0.6) {
    confidence += 0.15;
  } else if (coverage >= 0.35) {
    confidence += 0.05;
  } else {
    confidence -= 0.1;
  }

  if (hasConnectedFeatureEvidence(relationships)) {
    confidence += 0.1;
  } else {
    confidence = Math.min(confidence, 0.65);
  }

  if (isBroadWhereToAddQuery(query)) {
    confidence = Math.min(confidence, 0.6);
  }

  if (hasIncompleteBrowserQueryState(query, relationships)) {
    confidence = Math.min(confidence, 0.65);
  }

  return Math.max(0.25, Math.min(0.9, Math.round(confidence * 100) / 100));
}

export function assessExistingCapabilityEvidence(query: string, relationships: Array<Record<string, unknown>>): { answerPrefix: string; evidence: Array<Record<string, unknown>> } {
  const types = new Set(relationships.map((relationship) => stringValue(relationship.type)));
  if (queryWantsBrowserQueryWrite(query.toLowerCase()) && !types.has("WRITES_QUERY_STRING") && !types.has("WRITES_BROWSER_HISTORY")) {
    return {
      answerPrefix: "",
      evidence: [{
        recordType: "capabilityAssessment",
        status: "adjacent-only",
        message: "Related browser query-state reads were found, but no browser URL write operation was detected. Treat this as a missing capability, not an existing implementation.",
        layers: ["browser-query-read"]
      }]
    };
  }
  const haystack = relationships.map((relationship) => JSON.stringify(relationship).toLowerCase()).join("\n");
  const domainTerms = domainFlowTerms(queryTerms(query));
  const hasDomainEvidence = domainTerms.length === 0 || domainTerms.some((term) => haystack.includes(term));
  const hasUiEvidence = ["HANDLES_EVENT", "SELECTS_ELEMENT", "WRITES_FIELD", "BINDS_MODEL_PROPERTY"].some((type) => types.has(type));
  const hasMappingEvidence = ["USES_CSHARP_SYMBOL", "BINDS_MODEL_PROPERTY", "PROJECTS_MODEL", "MAPS_PROPERTY", "WRITES_FIELD"].some((type) => types.has(type));
  const hasRenderEvidence = ["INVOKES_VIEW_COMPONENT", "RENDERS_VIEW"].some((type) => types.has(type));

  if (!hasDomainEvidence || !hasUiEvidence || !hasMappingEvidence || !hasRenderEvidence) {
    return { answerPrefix: "", evidence: [] };
  }

  return {
    answerPrefix: `Existing implementation evidence found for "${query}" across UI binding, model/config mapping, and rendering. Treat this as a gap-analysis query before adding duplicate behavior. `,
    evidence: [{
      recordType: "capabilityAssessment",
      status: "likely-existing-or-partial",
      message: "Atlas found connected UI, model/config, and rendering evidence. Inspect the recommended files for missing UX or integration gaps before creating a new implementation.",
      layers: ["ui-binding", "model-or-config-mapping", "rendering"]
    }]
  };
}

export function addRecommendationReason(recommendation: FileRecommendation, reason: string): void {
  if (!recommendation.reasons.includes(reason)) {
    recommendation.reasons.push(reason);
  }
}

export function sortRecommendationReasons(recommendation: FileRecommendation): void {
  recommendation.reasons = recommendation.reasons
    .sort((left, right) => reasonPriority(left) - reasonPriority(right))
    .slice(0, 4);
}

function hasConnectedFeatureEvidence(relationships: Array<Record<string, unknown>>): boolean {
  const connectedTypes = new Set([
    "CALLS",
    "POSTS_TO",
    "MAPS_ROUTE",
    "INJECTS",
    "HANDLES_EVENT",
    "READS_QUERY_STRING",
    "WRITES_QUERY_STRING",
    "WRITES_BROWSER_HISTORY",
    "INVOKES_VIEW_COMPONENT",
    "RENDERS_VIEW",
    "READS_TABLE",
    "JOINS_TABLE",
    "WRITES_TABLE",
    "UPSERTS_TABLE",
    "DELETES_FROM_TABLE",
    "MAPS_DAPPER_RESULT",
    "USES_DAPPER_PARAMETER",
    "PROJECTS_DAPPER_ROW",
    "MAPS_DAPPER_PROPERTY",
    "PROJECTS_MODEL",
    "INSERTS_ROW",
    "ROW_IN_TABLE",
    "ROW_HAS_TYPE_CODE"
  ]);
  return relationships.some((relationship) => connectedTypes.has(stringValue(relationship.type)));
}

function getRecommendation(recommendations: Map<string, FileRecommendation>, file: string): FileRecommendation {
  const existing = recommendations.get(file);
  if (existing) {
    return existing;
  }

  const recommendation: FileRecommendation = {
    recordType: "fileRecommendation",
    file,
    score: 0,
    reasons: [],
    matchedTerms: [],
    patternsToFollow: [],
    relationshipEvidenceCount: 0,
    searchEvidenceCount: 0,
    relationshipDetails: [],
    anchorDetails: []
  };
  recommendations.set(file, recommendation);
  return recommendation;
}

function addPattern(recommendation: FileRecommendation, pattern: string): void {
  if (pattern && !recommendation.patternsToFollow.includes(pattern)) {
    recommendation.patternsToFollow.push(pattern);
  }
}

function addTerms(recommendation: FileRecommendation, terms: string[]): void {
  recommendation.matchedTerms = uniqueStrings([...recommendation.matchedTerms, ...terms]);
}

function textMatchesAnyTerm(text: string, terms: string[]): boolean {
  const haystack = text.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function relationshipRecommendationReason(relationship: Record<string, unknown>): string {
  const type = stringValue(relationship.type) || "RELATIONSHIP";
  const from = compactRelationshipEndpoint(stringValue(relationship.from));
  const to = compactRelationshipEndpoint(stringValue(relationship.to));
  const range = relationship.range && typeof relationship.range === "object" ? relationship.range as Record<string, unknown> : {};
  const line = numberValue(range.startLine);
  return `${type}: ${from} -> ${to}${line > 0 ? ` at line ${line}` : ""}.`;
}

function compactRelationshipEndpoint(value: string): string {
  const clean = value
    .replace(/^symbol:csharp:/u, "")
    .replace(/^symbol:(?:razor|javascript):/u, "")
    .replace(/^route:(?:csharp|web):/u, "");
  const parameterIndex = clean.indexOf("(");
  const withoutParameters = parameterIndex >= 0 ? clean.slice(0, parameterIndex) : clean;
  const parts = withoutParameters.split(/[/.]/u);
  const compact = parts.slice(-3).join(".") || value;
  return parameterIndex >= 0 ? `${compact}(...)` : compact;
}

function reasonPriority(reason: string): number {
  if (/^[A-Z][A-Z_]+:/u.test(reason) || reason.startsWith("Strong symbol anchor:")) {
    return 0;
  }
  if (reason.startsWith("Search ")) {
    return 1;
  }
  if (reason.startsWith("Node tag match:")) {
    return 1;
  }
  if (reason.startsWith("Follows detected pattern:")) {
    return 3;
  }
  return 2;
}

function isBroadWhereToAddQuery(query: string): boolean {
  return queryTerms(query).length <= 1;
}

function isViewSurfaceFile(file: string): boolean {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  return hasPathSegment(normalized, "views") || /\.(cshtml|razor|html?)$/iu.test(normalized);
}

function roleWeight(file: string, query: string): number {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  const lowerQuery = query.toLowerCase();
  const wantsValidation = queryWantsValidationOrAuth(lowerQuery);
  const wantsFormOrProfile = queryWantsFormOrProfile(lowerQuery);
  const wantsBrowserQueryState = queryWantsBrowserQueryState(lowerQuery);
  const wantsTemplateBackedDetail = queryWantsTemplateBackedDetail(lowerQuery);
  let score = 0;

  if (hasPathSegment(normalized, "controllers")) {
    score += lowerQuery.includes("endpoint") || lowerQuery.includes("route") || lowerQuery.includes("api") ? 32 : wantsValidation || wantsFormOrProfile ? 16 : 2;
  }
  if (isIdentityAccountPageModel(normalized)) {
    score += queryWantsIdentityAccountFlow(lowerQuery) && !wantsTemplateBackedDetail ? 24 : 2;
  }
  if (queryWantsIdentityUserShape(lowerQuery)) {
    if (isIdentityUserModel(normalized)) {
      score += 90;
    } else if (isIdentityDbContext(normalized)) {
      score += 42;
    } else if (isIdentityAccountPageModel(normalized)) {
      score += 14;
    }
  }
  if (hasPathSegment(normalized, "services")) {
    score += wantsValidation || wantsFormOrProfile ? 8 : 3;
  }
  if (hasPathSegment(normalized, "validation") || hasPathSegment(normalized, "validators") || normalized.endsWith("validator.cs")) {
    score += wantsValidation ? 80 : 3;
  }
  if (hasPathSegment(normalized, "handlers") || normalized.endsWith("handler.cs")) {
    score += lowerQuery.includes("handler") || lowerQuery.includes("command") || (lowerQuery.includes("query") && !wantsBrowserQueryState) ? 70 : lowerQuery.includes("request") ? 35 : 2;
  }
  if (hasPathSegment(normalized, "background") || normalized.endsWith("worker.cs") || normalized.endsWith("hostedservice.cs")) {
    score += lowerQuery.includes("background") || lowerQuery.includes("hosted") || lowerQuery.includes("worker") || lowerQuery.includes("digest") || lowerQuery.includes("sync") ? 70 : 2;
  }
  if (hasPathSegment(normalized, "middleware") || normalized.endsWith("middleware.cs")) {
    score += lowerQuery.includes("middleware") || lowerQuery.includes("pipeline") ? 70 : lowerQuery.includes("request") && !wantsValidation ? 12 : 2;
  }
  if (hasPathSegment(normalized, "repositories")) {
    score += lowerQuery.includes("field") || lowerQuery.includes("data") || lowerQuery.includes("persist") || lowerQuery.includes("save") ? 8 : 1;
  }
  if (hasPathSegment(normalized, "data")) {
    score += lowerQuery.includes("field") || lowerQuery.includes("data") || lowerQuery.includes("persist") || lowerQuery.includes("save") ? 36 : 1;
  }
  if (hasPathSegment(normalized, "options") || normalized.endsWith("options.cs")) {
    score += lowerQuery.includes("setting") || lowerQuery.includes("config") || lowerQuery.includes("option") ? 60 : 2;
  }
  if (wantsBrowserQueryState && /\.(?:js|mjs|cjs)$/i.test(normalized)) {
    score += 20;
  }
  if (normalized.endsWith("program.cs")) {
    score += queryWantsCompositionRoot(lowerQuery) ? 28 : 0;
  }
  if (hasPathSegment(normalized, "models") || /model\.cs$/i.test(normalized) || /request\.cs$/i.test(normalized)) {
    score += wantsValidation || wantsFormOrProfile ? 18 : 1;
  }
  if (wantsFormOrProfile && /(?:^|\/|\.)(forms?|profile|profiles|account|identity|registration|register)(?:\/|\.|$|[a-z])/i.test(normalized)) {
    score += 18;
  }
  if (hasPathSegment(normalized, "views") || normalized.endsWith(".cshtml") || normalized.endsWith(".html")) {
    score += wantsFormOrProfile ? 30 : lowerQuery.includes("form") || lowerQuery.includes("field") || lowerQuery.includes("ui") ? 45 : 1;
  }
  if (hasPathSegment(normalized, "wwwroot") || normalized.endsWith(".js")) {
    score += lowerQuery.includes("button") || lowerQuery.includes("form") || lowerQuery.includes("ajax") || lowerQuery.includes("fetch") ? 8 : 1;
  }
  if (wantsTemplateBackedDetail) {
    score += templateBackedDetailWeight(normalized);
    if (isIdentityAccountPage(normalized) && !/\b(identity|account|login|register|registration|external|personal data|delete personal data|download personal data)\b/i.test(lowerQuery)) {
      score -= 85;
    }
    if (isRuntimePersonaDetailSurface(normalized)) {
      score -= 12;
    }
  }

  return score;
}

function templateBackedDetailWeight(normalizedFile: string): number {
  let score = 0;
  if (isAdminObjectManagementFile(normalizedFile)) {
    score += 115;
  }
  if (/(personadetailtemplate|persona_detail_templates|detailtemplates|detailtemplate)/i.test(normalizedFile)) {
    score += 95;
  }
  if (/(personadetailtypecode|typecode|typecodes|objecttypes|objecttypetranslations)/i.test(normalizedFile)) {
    score += 70;
  }
  if (/(admin|admintools|pageadmin)/i.test(normalizedFile) && /(object|type|category|tree|index|management)/i.test(normalizedFile)) {
    score += 50;
  }
  if (/(persona|profile)/i.test(normalizedFile) && /(detail|info|type|template)/i.test(normalizedFile)) {
    score += 20;
  }
  return score;
}

function isAdminObjectManagementFile(normalizedFile: string): boolean {
  return /(^|\/)admintools\//i.test(normalizedFile)
    && /(objectmanagement|iobjectmanagement|pages\/index\.cshtml|pages\/index\.cshtml\.cs|object-tree|objecttypes|typeinput|savetype)/i.test(normalizedFile);
}

function isRuntimePersonaDetailSurface(normalizedFile: string): boolean {
  return /persona\/kelp-persona-edit\.js$/i.test(normalizedFile)
    || /views\/shared\/components\/personainfo\/default\.cshtml$/i.test(normalizedFile)
    || /(^|\/)controllers\/personacontroller\.cs$/i.test(normalizedFile);
}

function isIdentityAccountPageModel(normalizedFile: string): boolean {
  return /(^|\/)areas\/identity\/pages\/account\//.test(normalizedFile) && normalizedFile.endsWith(".cshtml.cs");
}

function isIdentityAccountPage(normalizedFile: string): boolean {
  return /(^|\/)areas\/identity\/pages\/account\//.test(normalizedFile);
}

function isIdentityUserModel(normalizedFile: string): boolean {
  return /(^|\/)(data|models)\/(?:applicationuser|identityuser|.+user)\.cs$/i.test(normalizedFile);
}

function isIdentityDbContext(normalizedFile: string): boolean {
  return /(^|\/)(?:applicationdbcontext|identitydbcontext|.+identitycontext|.+usercontext)\.cs$/i.test(normalizedFile)
    || /(^|\/)data\/.+dbcontext\.cs$/i.test(normalizedFile);
}

function compositionRootPenalty(file: string, query: string): number {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  if (!/(^|\/)(program|startup)\.cs$/.test(normalized)) {
    return 0;
  }

  const lowerQuery = query.toLowerCase();
  if (queryWantsCompositionRoot(lowerQuery)) {
    return 0;
  }

  return queryWantsValidationOrAuth(lowerQuery) || queryWantsFormOrProfile(lowerQuery) || queryWantsIdentityAccountFlow(lowerQuery) ? 90 : 28;
}

function genericBaseTypePenalty(file: string, query: string): number {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  if (!/(basecontroller|controllerbase|base\.cs$|base\/)/i.test(normalized)) {
    return 0;
  }

  return /\b(base|shared|abstract|infrastructure|framework|composable|editor)\b/i.test(query) ? 0 : 36;
}
