import { isCommonExternalSymbol } from "./queryFlow";
import { isLikelyTestFile } from "./queryPath";
import { booleanValue, numberValue, stringValue } from "./queryUtils";

export function buildArchitectureHotspots(relationships: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  interface HotspotStats {
    file: string;
    relationshipCount: number;
    types: Map<string, number>;
    endpoints: Set<string>;
  }

  const byFile = new Map<string, HotspotStats>();
  const endpointCounts = new Map<string, number>();

  for (const relationship of relationships) {
    const file = stringValue(relationship.file);
    if (!file || isLikelyTestFile(file)) {
      continue;
    }

    const stats = byFile.get(file) ?? {
      file,
      relationshipCount: 0,
      types: new Map<string, number>(),
      endpoints: new Set<string>()
    };
    stats.relationshipCount += 1;
    const type = stringValue(relationship.type) || "UNKNOWN";
    stats.types.set(type, (stats.types.get(type) ?? 0) + 1);
    for (const endpoint of [stringValue(relationship.from), stringValue(relationship.to)]) {
      if (endpoint && !isCommonExternalSymbol(endpoint)) {
        stats.endpoints.add(endpoint);
        endpointCounts.set(endpoint, (endpointCounts.get(endpoint) ?? 0) + 1);
      }
    }
    byFile.set(file, stats);
  }

  return [...byFile.values()]
    .map((stats) => {
      const sharedEndpointCount = [...stats.endpoints].filter((endpoint) => (endpointCounts.get(endpoint) ?? 0) > 1).length;
      const relationshipTypes = [...stats.types.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([type, count]) => ({ type, count }));
      const role = inferHotspotRole(stats.file, relationshipTypes.map((entry) => entry.type));
      const score = stats.relationshipCount + stats.types.size * 3 + sharedEndpointCount * 2 + hotspotRoleScore(role);
      return {
        recordType: "architectureHotspot",
        file: stats.file,
        score,
        role,
        relationshipCount: stats.relationshipCount,
        distinctRelationshipTypes: stats.types.size,
        sharedEndpointCount,
        topRelationshipTypes: relationshipTypes.slice(0, 5),
        guidance: hotspotGuidance(role)
      };
    })
    .filter((hotspot) => numberValue(hotspot.score) >= 4)
    .sort((left, right) =>
      numberValue(right.score) - numberValue(left.score) ||
      numberValue(right.relationshipCount) - numberValue(left.relationshipCount) ||
      stringValue(left.file).localeCompare(stringValue(right.file))
    );
}

export function buildPrecomputedArchitectureHotspots(
  rows: Array<Record<string, unknown>>,
  typesByFile: Map<string, Array<Record<string, unknown>>>
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const file = stringValue(row.file);
    const relationshipTypes = typesByFile.get(file) ?? [];
    const role = inferHotspotRole(file, relationshipTypes.map((entry) => stringValue(entry.type)));
    const relationshipCount = numberValue(row.outgoing_count);
    const score = numberValue(row.hotspot_score);
    const sharedEndpointCount = Math.max(0, Math.round((score - relationshipCount - relationshipTypes.length * 3 - hotspotRoleScore(role)) / 2));
    return {
      recordType: "architectureHotspot",
      file,
      score,
      role,
      relationshipCount,
      distinctRelationshipTypes: relationshipTypes.length,
      sharedEndpointCount,
      topRelationshipTypes: relationshipTypes.slice(0, 5),
      usageSummary: {
        incomingCount: numberValue(row.incoming_count),
        outgoingCount: numberValue(row.outgoing_count),
        referenceCount: numberValue(row.reference_count),
        projectCount: numberValue(row.project_count),
        editLikelihood: numberValue(row.edit_likelihood),
        avoidInitially: booleanValue(row.avoid_initially) === true
      },
      hotspotSource: "node_usage_summary",
      guidance: hotspotGuidance(role)
    };
  });
}

function inferHotspotRole(file: string, relationshipTypes: string[]): string {
  const normalized = file.replace(/\\/g, "/");
  const basename = normalized.split("/").pop() ?? normalized;
  const types = new Set(relationshipTypes);

  if (/^(Program|Startup)\.cs$/iu.test(basename) || types.has("REGISTERS") || types.has("USES_MIDDLEWARE")) {
    return "composition-root";
  }
  if (/appsettings|config|options|settings/iu.test(normalized) || types.has("USES_CONFIG_KEY") || types.has("BINDS_OPTIONS")) {
    return "configuration";
  }
  if (/(Controller|PageModel|\.cshtml\.cs)$/iu.test(basename) || /\.(cshtml|razor)$/iu.test(basename) || types.has("MAPS_ROUTE") || types.has("HANDLES_REQUEST")) {
    return "entry-point";
  }
  if (/(Service|Manager|Repository|Adapter)\.cs$/iu.test(basename) || types.has("CALLS_REPOSITORY") || types.has("USES_DBSET")) {
    return "service-layer";
  }
  if (/\.(js|ts|tsx)$/iu.test(basename) || types.has("HANDLES_EVENT") || types.has("WRITES_QUERY_STRING")) {
    return "client-flow";
  }
  return "shared-bridge";
}

function hotspotRoleScore(role: string): number {
  switch (role) {
    case "composition-root":
    case "configuration":
      return 4;
    case "entry-point":
    case "service-layer":
      return 2;
    default:
      return 0;
  }
}

function hotspotGuidance(role: string): string {
  switch (role) {
    case "composition-root":
      return "Avoid editing unless the task is explicitly startup, DI, routing, middleware, or shared setup. Use this for architecture context first.";
    case "configuration":
      return "Likely shared configuration/options surface. Check binding and usage before adding new keys or settings.";
    case "entry-point":
      return "Likely request or UI entry point. Use it to understand flow, then prefer the matching feature service/model/view files for edits.";
    case "service-layer":
      return "Likely shared behavior or data orchestration. Check callers before changing behavior.";
    case "client-flow":
      return "Likely browser interaction hub. Check related selectors, events, routes, and state writes before editing.";
    default:
      return "Likely bridge file across multiple graph relationships. Use for orientation and risk checks before editing.";
  }
}
