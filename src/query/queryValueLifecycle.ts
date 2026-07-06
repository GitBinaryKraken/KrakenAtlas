import { placeholders, stringValue, uniqueStrings } from "./queryUtils";

export type ValueLifecycleJsonReader = (sql: string, params?: unknown[]) => Array<Record<string, unknown>>;

export interface ValueLifecycleRelationshipOptions {
  query: string;
  symbolIds: string[];
  edgeTypes: string[];
  limit: number;
  relationshipContext: { sql: string; params: string[] };
  readJson: ValueLifecycleJsonReader;
}

export function findValueLifecycleRelationships(options: ValueLifecycleRelationshipOptions): Array<Record<string, unknown>> {
  const anchors = findValueLifecycleAnchors(options.query, options.symbolIds, options.readJson);
  if (anchors.length === 0) {
    return [];
  }

  const lifecycleTypes = ["BINDS_MODEL_PROPERTY", "USES_CSHARP_SYMBOL", "WRITES_FIELD", "MAPS_PROPERTY"];
  const allowedTypes = options.edgeTypes.length
    ? lifecycleTypes.filter((type) => options.edgeTypes.includes(type))
    : lifecycleTypes;
  if (allowedTypes.length === 0) {
    return [];
  }

  return options.readJson(
    `SELECT json FROM relationships
     WHERE type IN (${placeholders(allowedTypes.length)})
       AND (${anchors.map(() => "(from_id LIKE ? OR to_id LIKE ? OR json LIKE ?)").join(" OR ")})
     ${options.relationshipContext.sql}
     ORDER BY
       CASE type
         WHEN 'BINDS_MODEL_PROPERTY' THEN 0
         WHEN 'USES_CSHARP_SYMBOL' THEN 1
         WHEN 'WRITES_FIELD' THEN 2
         WHEN 'MAPS_PROPERTY' THEN 3
         ELSE 20
       END,
       file,
       start_line
     LIMIT ${options.limit};`,
    [
      ...allowedTypes,
      ...anchors.flatMap((anchor) => [`%${anchor}%`, `%${anchor}%`, `%${anchor}%`]),
      ...options.relationshipContext.params
    ]
  );
}

function findValueLifecycleAnchors(query: string, symbolIds: string[], readJson: ValueLifecycleJsonReader): string[] {
  const directTerms = symbolIds.length ? [] : valueLifecycleTermsFromText(query);
  if (symbolIds.length === 0) {
    return directTerms;
  }

  const symbols = readJson(
    `SELECT json FROM symbols WHERE id IN (${placeholders(symbolIds.length)}) LIMIT 80;`,
    symbolIds
  );
  const classSymbols = symbols.filter((symbol) => ["class", "record", "struct"].includes(stringValue(symbol.kind)));
  const classFqns = classSymbols
    .map((symbol) => stringValue(symbol.fullyQualifiedName))
    .filter(Boolean);
  const propertyRows = classFqns.length ? readJson(
    `SELECT json FROM symbols
     WHERE kind = 'property'
       AND (${classFqns.map(() => "fully_qualified_name LIKE ?").join(" OR ")})
     ORDER BY file, start_line
     LIMIT 80;`,
    classFqns.map((fqn) => `${fqn}.%`)
  ) : [];
  const classSubjectTerms = uniqueStrings(classSymbols.flatMap((symbol) => identifierWords(stringValue(symbol.name))))
    .filter((term) => !/^(profile|form|request|response|view|model|editor|input|update|upsert)$/iu.test(term));
  const matchingPropertyRows = classSubjectTerms.length
    ? propertyRows.filter((row) => {
      const propertyTerms = identifierWords(stringValue(row.name));
      return propertyTerms.some((term) => classSubjectTerms.some((subject) => subject.toLowerCase() === term.toLowerCase()));
    })
    : [];
  const selectedPropertyRows = matchingPropertyRows.length ? matchingPropertyRows : propertyRows;
  const selectedSymbols = classSymbols.length ? classSymbols : symbols;

  return uniqueStrings([
    ...directTerms,
    ...selectedSymbols.flatMap(symbolValueLifecycleTerms),
    ...selectedPropertyRows.flatMap(symbolValueLifecycleTerms)
  ]).slice(0, 30);
}

function symbolValueLifecycleTerms(symbol: Record<string, unknown>): string[] {
  const name = stringValue(symbol.name);
  const fullyQualifiedName = stringValue(symbol.fullyQualifiedName);
  const lastQualifiedPart = fullyQualifiedName.split(".").filter(Boolean).pop() ?? "";
  return valueLifecycleTermsFromText([
    name,
    lastQualifiedPart
  ].map(stringValue).join(" "));
}

function valueLifecycleTermsFromText(text: string): string[] {
  const compactText = text
    .replace(/^symbol:csharp:/u, "")
    .replace(/\([^)]*\)/gu, " ");
  const rawParts = compactText.split(/[^A-Za-z0-9_]+/u).map((part) => part.split(".").filter(Boolean).pop() ?? part);
  const terms = rawParts.flatMap((part) => splitIdentifierTerms(part));
  return uniqueStrings(terms.filter(isUsefulValueLifecycleTerm));
}

function splitIdentifierTerms(value: string): string[] {
  if (!value) {
    return [];
  }

  const withoutCommonSuffix = value.replace(/(?:View)?Model$/u, "");
  const withoutIdSuffix = withoutCommonSuffix.replace(/Id$/u, "");
  return uniqueStrings([
    value,
    withoutCommonSuffix,
    withoutIdSuffix
  ]);
}

function identifierWords(value: string): string[] {
  return value
    .replace(/(?:View)?Model$/u, "")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
    .split(/[^A-Za-z0-9]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);
}

function isUsefulValueLifecycleTerm(term: string): boolean {
  const normalized = term.trim();
  if (normalized.length < 3) {
    return false;
  }

  return !/^(symbol|csharp|razor|javascript|model|view|models|views|page|pages|form|forms|input|property|class|record|string|int|guid|bool|nullable)$/iu.test(normalized);
}
