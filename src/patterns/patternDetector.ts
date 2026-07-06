import { PatternRecord, RelationshipRecord, SymbolRecord } from "../model/records";

export interface PatternDetectionInput {
  symbols: SymbolRecord[];
  relationships: RelationshipRecord[];
}

interface PatternDefinition {
  id: string;
  name: string;
  category: string;
  language?: string;
  relationshipTypes: string[];
  rulesObserved: string[];
  agentGuidance: string;
}

const patternDefinitions: PatternDefinition[] = [
  {
    id: "pattern:dotnet:constructor-injection",
    name: "Constructor injection",
    category: "dependency-management",
    language: "csharp",
    relationshipTypes: ["INJECTS"],
    rulesObserved: ["Types receive dependencies through constructor parameters."],
    agentGuidance: "When adding a dependency to an existing C# type, prefer constructor injection and follow nearby field naming conventions."
  },
  {
    id: "pattern:dotnet:interface-implementation-pair",
    name: "Interface implementation pair",
    category: "architecture",
    language: "csharp",
    relationshipTypes: ["IMPLEMENTS"],
    rulesObserved: ["Concrete classes implement matching service or repository interfaces."],
    agentGuidance: "When adding a new service-like type, look for matching interface and implementation pairs and mirror their placement and naming."
  },
  {
    id: "pattern:dotnet:service-registration",
    name: "Service registration",
    category: "dependency-management",
    language: "csharp",
    relationshipTypes: ["REGISTERS"],
    rulesObserved: ["Services are registered with the dependency injection container."],
    agentGuidance: "When adding a new injectable service, add the matching DI registration near existing registrations."
  },
  {
    id: "pattern:dotnet:ef-data-access",
    name: "EF data access",
    category: "data-access",
    language: "csharp",
    relationshipTypes: ["DBSET_FOR", "USES_DBSET", "QUERIES", "WRITES"],
    rulesObserved: ["DbContext exposes DbSet properties and repository/service methods query or write through those sets."],
    agentGuidance: "When changing persisted data, follow DbSet and repository usage edges before editing models, migrations, or service logic."
  },
  {
    id: "pattern:dotnet:repository-data-flow",
    name: "Repository data flow",
    category: "data-access",
    language: "csharp",
    relationshipTypes: ["CALLS_REPOSITORY", "QUERIES", "WRITES", "USES_DBSET"],
    rulesObserved: ["Services call repository methods, and repositories query or write DbSet-backed data."],
    agentGuidance: "When changing persisted behavior, follow service-to-repository calls and repository read/write edges before editing broad data code."
  },
  {
    id: "pattern:dotnet:options-config",
    name: "Options/config binding",
    category: "configuration",
    language: "csharp",
    relationshipTypes: ["BINDS_OPTIONS", "USES_OPTIONS", "USES_CONFIG_KEY"],
    rulesObserved: ["Configuration sections bind to options classes and application services consume typed options."],
    agentGuidance: "When adding or changing a setting, inspect the options class, its binding location, and option consumers before editing broad configuration code."
  },
  {
    id: "pattern:dotnet:validation-auth",
    name: "Validation and authorization",
    category: "request-safety",
    language: "csharp",
    relationshipTypes: ["VALIDATES", "USES_VALIDATOR", "REQUIRES_AUTH"],
    rulesObserved: ["Requests are validated by dedicated validators, and protected endpoints declare authorization requirements."],
    agentGuidance: "When changing request behavior, inspect validators and authorization requirements before editing controller or service logic."
  },
  {
    id: "pattern:dotnet:hosted-service",
    name: "Hosted service",
    category: "background-work",
    language: "csharp",
    relationshipTypes: ["RUNS_HOSTED_SERVICE"],
    rulesObserved: ["Background services are registered from the application composition root."],
    agentGuidance: "When changing background behavior, inspect hosted service registrations and the hosted service implementation before opening unrelated services."
  },
  {
    id: "pattern:dotnet:middleware-pipeline",
    name: "Middleware pipeline",
    category: "request-pipeline",
    language: "csharp",
    relationshipTypes: ["USES_MIDDLEWARE"],
    rulesObserved: ["The application composes request behavior through middleware calls in startup code."],
    agentGuidance: "When changing cross-cutting request behavior, inspect middleware pipeline order and custom middleware before editing endpoint logic."
  },
  {
    id: "pattern:dotnet:request-handler",
    name: "Request handler",
    category: "application-flow",
    language: "csharp",
    relationshipTypes: ["HANDLES_REQUEST"],
    rulesObserved: ["Request, command, or query types are handled by dedicated handler classes."],
    agentGuidance: "When changing request handling behavior, inspect the request type and its handler before opening broad service code."
  },
  {
    id: "pattern:dotnet:project-references",
    name: ".NET project references",
    category: "solution-structure",
    language: "csharp",
    relationshipTypes: ["PROJECT_REFERENCES"],
    rulesObserved: ["Projects depend on sibling projects through .csproj ProjectReference items."],
    agentGuidance: "When changing cross-project contracts, inspect project reference edges before editing callers and implementations in separate folders."
  },
  {
    id: "pattern:aspnet:controller-service-flow",
    name: "Controller-service flow",
    category: "feature-flow",
    language: "csharp",
    relationshipTypes: ["MAPS_ROUTE", "INJECTS", "CALLS"],
    rulesObserved: ["Controller actions map routes and delegate behavior to injected services."],
    agentGuidance: "When adding an endpoint, start from the existing controller route and follow its service call path before editing broad areas."
  },
  {
    id: "pattern:web:html-form-handler",
    name: "HTML form handler",
    category: "ui-flow",
    relationshipTypes: ["POSTS_TO"],
    rulesObserved: ["Forms post to explicit routes, controller actions, or page handlers."],
    agentGuidance: "When adding a form field or submit action, inspect the form's POST target and nearest handler before opening unrelated UI files."
  },
  {
    id: "pattern:web:vanilla-js-dom-event",
    name: "Vanilla JS DOM event binding",
    category: "ui-flow",
    language: "javascript",
    relationshipTypes: ["HANDLES_EVENT", "SELECTS_ELEMENT"],
    rulesObserved: ["Plain JavaScript binds DOM events through selectors and element IDs."],
    agentGuidance: "When adding a browser interaction, reuse the existing selector and event binding style for nearby elements."
  },
  {
    id: "pattern:web:fetch-endpoint",
    name: "Fetch endpoint call",
    category: "ui-backend-flow",
    language: "javascript",
    relationshipTypes: ["CALLS"],
    rulesObserved: ["Vanilla JavaScript calls backend endpoints with fetch."],
    agentGuidance: "When changing AJAX behavior, follow fetch call edges to the backend route before loading larger context."
  },
  {
    id: "pattern:react:component-composition",
    name: "React component composition",
    category: "ui-flow",
    language: "typescript",
    relationshipTypes: ["RENDERS_COMPONENT", "PASSES_PROP"],
    rulesObserved: ["React components compose other components through JSX and pass props at the call site."],
    agentGuidance: "When changing React UI behavior, start from the rendering component and follow component/prop edges before opening broad frontend folders."
  },
  {
    id: "pattern:react:hook-context-flow",
    name: "React hook and context flow",
    category: "state-flow",
    language: "typescript",
    relationshipTypes: ["USES_HOOK", "PROVIDES_CONTEXT", "CONSUMES_CONTEXT"],
    rulesObserved: ["React components and hooks share state through hooks and context providers."],
    agentGuidance: "When changing shared React state, inspect the provider, consuming hook, and components that use the hook before editing unrelated state code."
  },
  {
    id: "pattern:react:state-store-flow",
    name: "React state store flow",
    category: "state-flow",
    language: "typescript",
    relationshipTypes: ["USES_STORE"],
    rulesObserved: ["React components and hooks read shared client state through store hooks."],
    agentGuidance: "When changing shared React state, start from the store hook and follow store consumers before opening unrelated component folders."
  },
  {
    id: "pattern:react:route-api-flow",
    name: "React route and API flow",
    category: "ui-backend-flow",
    language: "typescript",
    relationshipTypes: ["MAPS_ROUTE", "CALLS_API_ROUTE"],
    rulesObserved: ["Route declarations point to page components, and frontend service functions call API routes."],
    agentGuidance: "When changing a routed React feature, follow route-to-page and page/hook-to-service/API edges before loading broad frontend context."
  }
];

export function detectPatterns(input: PatternDetectionInput): PatternRecord[] {
  const patterns: PatternRecord[] = [];
  const symbolFiles = new Map(input.symbols.map((symbol) => [symbol.id, symbol.file]));

  for (const definition of patternDefinitions) {
    const evidence = matchingEvidence(definition, input.relationships);
    if (evidence.length === 0) {
      continue;
    }

    const instances = evidence.slice(0, 8).map((relationship) => ({
      name: relationship.type,
      files: uniqueStrings([
        relationship.file ?? "",
        symbolFiles.get(relationship.from) ?? "",
        symbolFiles.get(relationship.to) ?? ""
      ]),
      symbols: [relationship.from, relationship.to].filter((value) => value.startsWith("symbol:"))
    }));

    patterns.push({
      recordType: "pattern",
      id: definition.id,
      name: definition.name,
      category: definition.category,
      language: definition.language,
      confidence: scorePattern(evidence.length),
      frequency: evidence.length,
      counterExampleCount: countCounterExamples(definition, input),
      instances,
      rulesObserved: definition.rulesObserved,
      agentGuidance: definition.agentGuidance
    });
  }

  return patterns.sort((left, right) => left.id.localeCompare(right.id));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function renderConventionsMarkdown(patterns: PatternRecord[]): string {
  const lines = ["# Kraken Atlas Conventions", ""];

  if (patterns.length === 0) {
    lines.push("No repeated patterns detected yet.", "");
    return lines.join("\n");
  }

  for (const pattern of patterns) {
    lines.push(`## ${pattern.name}`);
    lines.push("");
    lines.push(`- ID: \`${pattern.id}\``);
    lines.push(`- Category: ${pattern.category}`);
    if (pattern.language) {
      lines.push(`- Language: ${pattern.language}`);
    }
    lines.push(`- Confidence: ${pattern.confidence.toFixed(2)}`);
    lines.push(`- Frequency: ${pattern.frequency}`);
    lines.push(`- Counterexamples: ${pattern.counterExampleCount}`);
    lines.push(`- Guidance: ${pattern.agentGuidance}`);
    lines.push("");

    if (pattern.instances.length > 0) {
      lines.push("Evidence:");
      for (const instance of pattern.instances.slice(0, 5)) {
        const files = instance.files?.length ? ` in ${instance.files.join(", ")}` : "";
        lines.push(`- ${instance.name ?? pattern.name}${files}`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function matchingEvidence(definition: PatternDefinition, relationships: RelationshipRecord[]): RelationshipRecord[] {
  const relationshipsByType = relationships.filter((relationship) => definition.relationshipTypes.includes(relationship.type));

  if (definition.id === "pattern:web:fetch-endpoint") {
    return relationshipsByType.filter((relationship) => relationship.from.startsWith("symbol:javascript:") && relationship.to.startsWith("route:"));
  }

  if (definition.id === "pattern:web:vanilla-js-dom-event") {
    return relationshipsByType.filter((relationship) => relationship.from.startsWith("symbol:javascript:") || relationship.to.startsWith("symbol:javascript:"));
  }

  if (definition.id.startsWith("pattern:react:")) {
    return relationshipsByType.filter((relationship) => relationship.id.includes(":react:") || relationship.from.startsWith("symbol:react:") || relationship.to.startsWith("symbol:react:") || relationship.to.startsWith("prop:react:") || relationship.to.startsWith("event:react:"));
  }

  if (definition.id === "pattern:aspnet:controller-service-flow") {
    return relationshipsByType.filter(
      (relationship) =>
        relationship.from.includes("Controller") ||
        relationship.file?.toLowerCase().includes("controller") ||
        relationship.to.includes("Service")
    );
  }

  return relationshipsByType;
}

function scorePattern(frequency: number): number {
  if (frequency >= 9) {
    return 0.9;
  }
  if (frequency >= 4) {
    return 0.75;
  }
  if (frequency >= 2) {
    return 0.55;
  }

  return 0.35;
}

function countCounterExamples(definition: PatternDefinition, input: PatternDetectionInput): number {
  if (definition.id !== "pattern:dotnet:constructor-injection") {
    return 0;
  }

  const injectedTypes = new Set(input.relationships.filter((relationship) => relationship.type === "INJECTS").map((relationship) => relationship.from));
  return input.symbols.filter(
    (symbol) =>
      symbol.kind === "class" &&
      symbol.language === "csharp" &&
      (symbol.name.endsWith("Controller") || symbol.name.endsWith("Service")) &&
      !injectedTypes.has(symbol.id)
  ).length;
}
