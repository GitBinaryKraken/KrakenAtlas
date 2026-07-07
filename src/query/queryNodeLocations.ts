import {
  firstLineRange,
  inferSyntheticNodeKind,
  nodeLocation
} from "./queryEvidence";
import { stringValue } from "./queryUtils";

export interface EndpointLocationDependencies {
  execJson(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
}

export function withEndpointLocations(
  rows: Array<Record<string, unknown>>,
  dependencies: EndpointLocationDependencies
): Array<Record<string, unknown>> {
  return rows.map((row) => ({
    ...row,
    fromLocation: resolveEndpointLocation(stringValue(row.from), row, dependencies),
    toLocation: resolveEndpointLocation(stringValue(row.to), row, dependencies)
  }));
}

function resolveEndpointLocation(
  endpointId: string,
  relationship: Record<string, unknown>,
  dependencies: EndpointLocationDependencies
): Record<string, unknown> | undefined {
  if (!endpointId) {
    return undefined;
  }

  const symbol = dependencies.execJson("SELECT json FROM symbols WHERE id = ? LIMIT 1;", [endpointId])[0];
  if (symbol) {
    return nodeLocation(endpointId, "symbol", stringValue(symbol.file), symbol.range, stringValue(symbol.kind), false);
  }

  if (endpointId.startsWith("file:")) {
    const file = endpointId.slice("file:".length);
    return nodeLocation(endpointId, "file", file, firstLineRange(), "file", true);
  }

  const file = stringValue(relationship.file);
  if (file) {
    return nodeLocation(endpointId, inferSyntheticNodeKind(endpointId), file, relationship.range, "relationship", true);
  }

  return {
    recordType: "nodeLocation",
    id: endpointId,
    nodeKind: inferSyntheticNodeKind(endpointId),
    approximate: true
  };
}
