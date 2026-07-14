import { RelationshipRecord, SourceRange, SymbolRecord } from "../model/records";

export interface CSharpProjectionAnalyzerResult {
  relationships: RelationshipRecord[];
}

interface PropertyProjectionGroup {
  fromTypeId: string;
  toTypeId: string;
  fromTypeName: string;
  toTypeName: string;
  file: string;
  range: SourceRange;
  mappedProperties: Array<{
    fromProperty: string;
    toProperty: string;
  }>;
}

export function analyzeCSharpModelProjections(symbols: SymbolRecord[], relationships: RelationshipRecord[]): CSharpProjectionAnalyzerResult {
  const symbolsById = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  const groups = new Map<string, PropertyProjectionGroup>();

  for (const relationship of relationships) {
    if (relationship.type !== "MAPS_PROPERTY") {
      continue;
    }

    const fromMember = symbolsById.get(relationship.from);
    const toMember = symbolsById.get(relationship.to);
    if (fromMember?.kind !== "property" || toMember?.kind !== "property") {
      continue;
    }

    const fromType = parentType(fromMember, symbolsById);
    const toType = parentType(toMember, symbolsById);
    if (!fromType || !toType || fromType.id === toType.id) {
      continue;
    }

    const file = relationship.file ?? fromMember.file;
    const range = relationship.range ?? fromMember.range;
    const key = `${fromType.id}\u0000${toType.id}\u0000${file}`;
    const group = groups.get(key) ?? {
      fromTypeId: fromType.id,
      toTypeId: toType.id,
      fromTypeName: fromType.name,
      toTypeName: toType.name,
      file,
      range,
      mappedProperties: []
    };

    if (!group.mappedProperties.some((item) => item.fromProperty === fromMember.name && item.toProperty === toMember.name)) {
      group.mappedProperties.push({
        fromProperty: fromMember.name,
        toProperty: toMember.name
      });
    }
    groups.set(key, group);
  }

  return {
    relationships: [...groups.values()]
      .filter(isStrongProjectionGroup)
      .map(projectionRelationship)
      .sort((left, right) => left.id.localeCompare(right.id))
  };
}

function isStrongProjectionGroup(group: PropertyProjectionGroup): boolean {
  const sourceProperties = new Set(group.mappedProperties.map((property) => property.fromProperty));
  const targetProperties = new Set(group.mappedProperties.map((property) => property.toProperty));
  return group.mappedProperties.length >= 2 && sourceProperties.size >= 2 && targetProperties.size >= 2;
}

function projectionRelationship(group: PropertyProjectionGroup): RelationshipRecord {
  return {
    recordType: "relationship",
    id: [
      "relationship:csharp-projection:projects_model",
      stableIdPart(group.file),
      stableIdPart(group.fromTypeId),
      stableIdPart(group.toTypeId)
    ].join(":"),
    from: group.fromTypeId,
    to: group.toTypeId,
    type: "PROJECTS_MODEL",
    file: group.file,
    range: group.range,
    evidence: `Model projection ${group.fromTypeName} -> ${group.toTypeName}: ${group.mappedProperties
      .slice(0, 8)
      .map((property) => `${property.fromProperty}->${property.toProperty}`)
      .join(", ")}`,
    confidence: group.mappedProperties.length >= 4 ? 0.78 : 0.72
  };
}

function parentType(symbol: SymbolRecord, symbolsById: Map<string, SymbolRecord>): SymbolRecord | undefined {
  const parentFqn = parentFullyQualifiedName(symbol);
  const parentId = parentFqn ? `symbol:csharp:${parentFqn}` : parentIdFromSymbolId(symbol.id, symbol.name);
  const parent = parentId ? symbolsById.get(parentId) : undefined;
  if (!parent || parent.language !== "csharp" || !["class", "record", "struct", "interface"].includes(parent.kind)) {
    return undefined;
  }
  return parent;
}

function parentFullyQualifiedName(symbol: SymbolRecord): string | undefined {
  const suffix = `.${symbol.name}`;
  return symbol.fullyQualifiedName?.endsWith(suffix)
    ? symbol.fullyQualifiedName.slice(0, -suffix.length)
    : undefined;
}

function parentIdFromSymbolId(symbolId: string, memberName: string): string | undefined {
  const suffix = `.${memberName}`;
  return symbolId.endsWith(suffix) ? symbolId.slice(0, -suffix.length) : undefined;
}

function stableIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/gu, "_").replace(/^_+|_+$/gu, "");
}
