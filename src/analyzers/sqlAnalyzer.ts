import * as fs from "fs/promises";
import * as path from "path";
import { FileRecord, RelationshipRecord, SourceRange, SymbolRecord } from "../model/records";

export interface SqlAnalyzerResult {
  symbols: SymbolRecord[];
  relationships: RelationshipRecord[];
}

interface TableOccurrence {
  tableName: string;
  normalizedTableName: string;
  operation: "READS_TABLE" | "JOINS_TABLE" | "WRITES_TABLE" | "UPSERTS_TABLE" | "DELETES_FROM_TABLE";
  offset: number;
  evidence: string;
}

interface DapperTypeBinding {
  normalizedTableName: string;
  relationshipType: "MAPS_DAPPER_RESULT" | "USES_DAPPER_PARAMETER";
  typeId: string;
  typeName: string;
  offset: number;
  evidence: string;
}

interface DapperResultVariable {
  variableName: string;
  typeId: string;
  typeName: string;
  offset: number;
}

interface DapperProjectionBinding {
  fromTypeId: string;
  toTypeId: string;
  fromTypeName: string;
  toTypeName: string;
  mappedProperties: Array<{
    fromMemberId: string;
    toMemberId: string;
    fromProperty: string;
    toProperty: string;
  }>;
  offset: number;
  evidence: string;
}

interface InsertedRowFact {
  normalizedTableName: string;
  rowId: string;
  rowLabel: string;
  identifierColumn: string;
  identifierValue: string;
  typeCodeValue?: string;
  offset: number;
  evidence: string;
}

interface CSharpTypeResolver {
  resolveType(typeText: string, filePath: string): string | undefined;
  resolveMember(typeId: string, memberName: string): string | undefined;
}

interface CSharpStringAssignment {
  name: string;
  value: string;
  offset: number;
}

interface DapperCall {
  methodName: string;
  genericArguments: string[];
  arguments: string[];
  offset: number;
  evidence: string;
}

const sqlScannableExtensions = new Set([
  ".cs",
  ".cshtml",
  ".razor",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".sql",
  ".json"
]);

const tableOperationPatterns: Array<{
  operation: TableOccurrence["operation"];
  pattern: RegExp;
  upsertAware?: boolean;
}> = [
  { operation: "READS_TABLE", pattern: /\bFROM\s+((?:"[^"]+"|\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|\[[^\]]+\]|[A-Za-z_][\w$]*))?)/giu },
  { operation: "JOINS_TABLE", pattern: /\bJOIN\s+((?:"[^"]+"|\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|\[[^\]]+\]|[A-Za-z_][\w$]*))?)/giu },
  { operation: "WRITES_TABLE", pattern: /\bINSERT\s+INTO\s+((?:"[^"]+"|\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|\[[^\]]+\]|[A-Za-z_][\w$]*))?)/giu, upsertAware: true },
  { operation: "WRITES_TABLE", pattern: /\bUPDATE\s+((?:"[^"]+"|\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|\[[^\]]+\]|[A-Za-z_][\w$]*))?)/giu },
  { operation: "DELETES_FROM_TABLE", pattern: /\bDELETE\s+FROM\s+((?:"[^"]+"|\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|\[[^\]]+\]|[A-Za-z_][\w$]*))?)/giu }
];

const sqlKeywordPattern = /\b(SELECT|FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM|ON\s+CONFLICT|MERGE)\b/iu;
const ignoredTableNames = new Set([
  "as",
  "by",
  "from",
  "in",
  "join",
  "lateral",
  "null",
  "on",
  "select",
  "set",
  "where",
  "with"
]);

export async function analyzeSqlDataAccess(workspaceRoot: string, files: FileRecord[], csharpSymbols: SymbolRecord[] = []): Promise<SqlAnalyzerResult> {
  const tableSymbols = new Map<string, SymbolRecord>();
  const relationships: RelationshipRecord[] = [];
  const seenRelationships = new Set<string>();
  const csharpResolver = createCSharpTypeResolver(csharpSymbols);

  for (const file of files.filter((candidate) => sqlScannableExtensions.has(candidate.extension))) {
    const fullPath = path.join(workspaceRoot, file.path);
    let text: string;
    try {
      text = await fs.readFile(fullPath, "utf8");
    } catch {
      continue;
    }

    if (!sqlKeywordPattern.test(text)) {
      const generatedTable = inferGeneratedTableName(file.path, text);
      if (generatedTable) {
        addGeneratedTableModelFact(file, generatedTable, tableSymbols, relationships, seenRelationships);
      }
      continue;
    }

    const lineStarts = buildLineStarts(text);
    for (const occurrence of extractTableOccurrences(text)) {
      const range = offsetRange(lineStarts, occurrence.offset);
      const tableId = tableNodeId(occurrence.normalizedTableName);
      if (!tableSymbols.has(tableId)) {
        tableSymbols.set(tableId, tableSymbol(tableId, occurrence.normalizedTableName, file.path, range));
      }

      const relationshipId = [
        "relationship:sql",
        occurrence.operation.toLowerCase(),
        stableIdPart(file.path),
        stableIdPart(occurrence.normalizedTableName),
        String(range.startLine)
      ].join(":");
      if (seenRelationships.has(relationshipId)) {
        continue;
      }
      seenRelationships.add(relationshipId);
      relationships.push({
        recordType: "relationship",
        id: relationshipId,
        from: file.id,
        to: tableId,
        type: occurrence.operation,
        file: file.path,
        range,
        evidence: occurrence.evidence,
        confidence: file.extension === ".sql" ? 0.86 : 0.72
      });
    }

    for (const rowFact of extractInsertedRowFacts(text)) {
      const range = offsetRange(lineStarts, rowFact.offset);
      const tableId = tableNodeId(rowFact.normalizedTableName);
      if (!tableSymbols.has(tableId)) {
        tableSymbols.set(tableId, tableSymbol(tableId, rowFact.normalizedTableName, file.path, range));
      }
      if (!tableSymbols.has(rowFact.rowId)) {
        tableSymbols.set(rowFact.rowId, databaseRowSymbol(rowFact, file.path, range));
      }

      addSqlRelationship(relationships, seenRelationships, {
        recordType: "relationship",
        id: [
          "relationship:sql",
          "inserts_row",
          stableIdPart(file.path),
          stableIdPart(rowFact.rowId)
        ].join(":"),
        from: file.id,
        to: rowFact.rowId,
        type: "INSERTS_ROW",
        file: file.path,
        range,
        evidence: rowFact.evidence,
        confidence: file.extension === ".sql" ? 0.84 : 0.68
      });
      addSqlRelationship(relationships, seenRelationships, {
        recordType: "relationship",
        id: [
          "relationship:sql",
          "row_in_table",
          stableIdPart(rowFact.rowId),
          stableIdPart(rowFact.normalizedTableName)
        ].join(":"),
        from: rowFact.rowId,
        to: tableId,
        type: "ROW_IN_TABLE",
        file: file.path,
        range,
        evidence: rowFact.evidence,
        confidence: 0.9
      });

      if (rowFact.typeCodeValue) {
        const typeCodeId = typeCodeValueNodeId(rowFact.typeCodeValue);
        if (!tableSymbols.has(typeCodeId)) {
          tableSymbols.set(typeCodeId, sqlTypeCodeValueSymbol(typeCodeId, rowFact, file.path, range));
        }
        addSqlRelationship(relationships, seenRelationships, {
          recordType: "relationship",
          id: [
            "relationship:sql",
            "row_has_type_code",
            stableIdPart(rowFact.rowId),
            stableIdPart(typeCodeId)
          ].join(":"),
          from: rowFact.rowId,
          to: typeCodeId,
          type: "ROW_HAS_TYPE_CODE",
          file: file.path,
          range,
          evidence: rowFact.evidence,
          confidence: 0.88
        });
      }
    }

    if (file.extension === ".cs") {
      for (const binding of extractDapperTypeBindings(text, file.path, csharpResolver.resolveType)) {
        const range = offsetRange(lineStarts, binding.offset);
        const tableId = tableNodeId(binding.normalizedTableName);
        if (!tableSymbols.has(tableId)) {
          tableSymbols.set(tableId, tableSymbol(tableId, binding.normalizedTableName, file.path, range));
        }

        const relationshipFrom = binding.relationshipType === "MAPS_DAPPER_RESULT" ? tableId : binding.typeId;
        const relationshipTo = binding.relationshipType === "MAPS_DAPPER_RESULT" ? binding.typeId : tableId;
        addSqlRelationship(relationships, seenRelationships, {
          recordType: "relationship",
          id: [
            "relationship:sql",
            binding.relationshipType === "MAPS_DAPPER_RESULT" ? "maps_dapper_result" : "uses_dapper_parameter",
            stableIdPart(file.path),
            stableIdPart(binding.normalizedTableName),
            stableIdPart(binding.typeId),
            String(range.startLine)
          ].join(":"),
          from: relationshipFrom,
          to: relationshipTo,
          type: binding.relationshipType,
          file: file.path,
          range,
          evidence: binding.evidence,
          confidence: binding.relationshipType === "MAPS_DAPPER_RESULT" ? 0.72 : 0.68
        });
      }

      for (const projection of extractDapperProjectionBindings(text, file.path, csharpResolver)) {
        const range = offsetRange(lineStarts, projection.offset);
        addSqlRelationship(relationships, seenRelationships, {
          recordType: "relationship",
          id: [
            "relationship:sql",
            "projects_dapper_row",
            stableIdPart(file.path),
            stableIdPart(projection.fromTypeId),
            stableIdPart(projection.toTypeId),
            String(range.startLine)
          ].join(":"),
          from: projection.fromTypeId,
          to: projection.toTypeId,
          type: "PROJECTS_DAPPER_ROW",
          file: file.path,
          range,
          evidence: projection.evidence,
          confidence: 0.72
        });

        for (const mappedProperty of projection.mappedProperties) {
          addSqlRelationship(relationships, seenRelationships, {
            recordType: "relationship",
            id: [
              "relationship:sql",
              "maps_dapper_property",
              stableIdPart(file.path),
              stableIdPart(mappedProperty.fromMemberId),
              stableIdPart(mappedProperty.toMemberId),
              String(range.startLine)
            ].join(":"),
            from: mappedProperty.fromMemberId,
            to: mappedProperty.toMemberId,
            type: "MAPS_DAPPER_PROPERTY",
            file: file.path,
            range,
            evidence: `${projection.fromTypeName}.${mappedProperty.fromProperty} -> ${projection.toTypeName}.${mappedProperty.toProperty}`,
            confidence: 0.76
          });
        }
      }
    }

    const generatedTable = inferGeneratedTableName(file.path, text);
    if (generatedTable) {
      addGeneratedTableModelFact(file, generatedTable, tableSymbols, relationships, seenRelationships);
    }
  }

  return {
    symbols: [...tableSymbols.values()].sort((left, right) => left.id.localeCompare(right.id)),
    relationships: relationships.sort((left, right) => left.id.localeCompare(right.id))
  };
}

function addSqlRelationship(
  relationships: RelationshipRecord[],
  seenRelationships: Set<string>,
  relationship: RelationshipRecord
): void {
  if (seenRelationships.has(relationship.id)) {
    return;
  }
  seenRelationships.add(relationship.id);
  relationships.push(relationship);
}

function addGeneratedTableModelFact(
  file: FileRecord,
  normalizedTableName: string,
  tableSymbols: Map<string, SymbolRecord>,
  relationships: RelationshipRecord[],
  seenRelationships: Set<string>
): void {
  const tableId = tableNodeId(normalizedTableName);
  const range = { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 };
  if (!tableSymbols.has(tableId)) {
    tableSymbols.set(tableId, tableSymbol(tableId, normalizedTableName, file.path, range));
  }

  const relationshipId = [
    "relationship:sql",
    "backs_table",
    stableIdPart(file.path),
    stableIdPart(normalizedTableName)
  ].join(":");
  if (seenRelationships.has(relationshipId)) {
    return;
  }
  seenRelationships.add(relationshipId);
  relationships.push({
    recordType: "relationship",
    id: relationshipId,
    from: file.id,
    to: tableId,
    type: "BACKS_TABLE",
    file: file.path,
    range,
    evidence: `${path.basename(file.path)} maps to ${normalizedTableName}`,
    confidence: 0.76
  });
}

export function extractTableOccurrences(text: string): TableOccurrence[] {
  const occurrences: TableOccurrence[] = [];
  for (const definition of tableOperationPatterns) {
    definition.pattern.lastIndex = 0;
    for (const match of text.matchAll(definition.pattern)) {
      const rawTableName = match[1] ?? "";
      const normalizedTableName = normalizeTableName(rawTableName);
      if (!isPlausibleTableName(normalizedTableName)) {
        continue;
      }

      const statement = statementWindow(text, match.index ?? 0);
      const operation = definition.upsertAware && /\bON\s+CONFLICT\b|\bMERGE\b/iu.test(statement)
        ? "UPSERTS_TABLE"
        : definition.operation;
      occurrences.push({
        tableName: rawTableName,
        normalizedTableName,
        operation,
        offset: match.index ?? 0,
        evidence: compactEvidence(statement)
      });
    }
  }

  return dedupeOccurrences(occurrences);
}

export function tableNodeId(normalizedTableName: string): string {
  return `table:${normalizedTableName}`;
}

function typeCodeValueNodeId(value: string): string {
  return `type-code:${value}`;
}

function extractDapperTypeBindings(
  text: string,
  filePath: string,
  resolveCSharpType: (typeText: string, filePath: string) => string | undefined
): DapperTypeBinding[] {
  const bindings: DapperTypeBinding[] = [];
  const stringAssignments = extractCSharpStringAssignments(text);
  const dapperCalls = extractDapperCalls(text);

  for (const call of dapperCalls) {
    const commandDefinitionArguments = commandDefinitionArgumentsFrom(call.arguments[0]);
    const sqlText = resolveSqlArgument(commandDefinitionArguments?.[0] ?? call.arguments[0], stringAssignments, call.offset);
    if (!sqlText || !sqlKeywordPattern.test(sqlText)) {
      continue;
    }

    const tableOccurrences = extractTableOccurrences(sqlText);
    if (tableOccurrences.length === 0) {
      continue;
    }

    if (isDapperQueryMethod(call.methodName)) {
      const resultType = dapperResultType(call.genericArguments);
      const resultTypeId = resultType ? resolveCSharpType(resultType, filePath) : undefined;
      if (!resultType || !resultTypeId) {
        continue;
      }

      for (const occurrence of tableOccurrences.filter((item) => item.operation === "READS_TABLE" || item.operation === "JOINS_TABLE")) {
        bindings.push({
          normalizedTableName: occurrence.normalizedTableName,
          relationshipType: "MAPS_DAPPER_RESULT",
          typeId: resultTypeId,
          typeName: resultType,
          offset: call.offset,
          evidence: `Dapper ${call.methodName}<${call.genericArguments.join(", ")}> maps ${occurrence.normalizedTableName} rows to ${resultType}: ${compactEvidence(call.evidence)}`
        });
      }
      continue;
    }

    const parameterArgument = commandDefinitionArguments?.[1] ?? call.arguments[1];
    const parameterType = parameterArgument ? inferDapperArgumentType(parameterArgument, text, call.offset) : undefined;
    const parameterTypeId = parameterType ? resolveCSharpType(parameterType, filePath) : undefined;
    if (!parameterType || !parameterTypeId) {
      continue;
    }

    for (const occurrence of tableOccurrences.filter((item) => ["WRITES_TABLE", "UPSERTS_TABLE", "DELETES_FROM_TABLE"].includes(item.operation))) {
      bindings.push({
        normalizedTableName: occurrence.normalizedTableName,
        relationshipType: "USES_DAPPER_PARAMETER",
        typeId: parameterTypeId,
        typeName: parameterType,
        offset: call.offset,
        evidence: `Dapper ${call.methodName} uses ${parameterType} parameters for ${occurrence.operation.toLowerCase()} ${occurrence.normalizedTableName}: ${compactEvidence(call.evidence)}`
      });
    }
  }

  return dedupeDapperTypeBindings(bindings);
}

function extractDapperProjectionBindings(
  text: string,
  filePath: string,
  resolver: CSharpTypeResolver
): DapperProjectionBinding[] {
  const rowVariables = extractDapperResultVariables(text, filePath, resolver.resolveType);
  if (rowVariables.length === 0) {
    return [];
  }

  const aliases = new Map<string, { typeId: string; typeName: string }>();
  for (const variable of rowVariables) {
    aliases.set(variable.variableName, { typeId: variable.typeId, typeName: variable.typeName });
  }
  for (const alias of extractDapperIterationAliases(text, rowVariables)) {
    aliases.set(alias.aliasName, { typeId: alias.typeId, typeName: alias.typeName });
  }

  if (aliases.size === 0) {
    return [];
  }

  const projections: DapperProjectionBinding[] = [];
  const objectInitializerPattern = /\bnew\s+([A-Za-z_][A-Za-z0-9_.]*(?:<[^>{};]+>)?)\s*\{/gu;
  objectInitializerPattern.lastIndex = 0;
  for (const match of text.matchAll(objectInitializerPattern)) {
    const targetTypeName = primaryModelTypeName(match[1] ?? "");
    const targetTypeId = targetTypeName ? resolver.resolveType(targetTypeName, filePath) : undefined;
    if (!targetTypeName || !targetTypeId) {
      continue;
    }

    const braceStart = text.indexOf("{", (match.index ?? 0) + match[0].length - 1);
    const initializer = braceStart >= 0 ? parseBalanced(text, braceStart, "{", "}") : undefined;
    if (!initializer) {
      continue;
    }

    const mappedBySource = new Map<string, DapperProjectionBinding>();
    for (const assignment of splitTopLevel(initializer.content, ",")) {
      const propertyMatch = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/u.exec(assignment);
      if (!propertyMatch) {
        continue;
      }
      const targetProperty = propertyMatch[1] ?? "";
      const expression = propertyMatch[2] ?? "";
      if (/[{[]/u.test(expression)) {
        continue;
      }
      const targetMemberId = resolver.resolveMember(targetTypeId, targetProperty);
      if (!targetMemberId) {
        continue;
      }

      for (const [aliasName, source] of aliases) {
        const propertyPattern = new RegExp(`\\b${escapeRegExp(aliasName)}\\.([A-Za-z_][A-Za-z0-9_]*)\\b`, "gu");
        propertyPattern.lastIndex = 0;
        for (const propertyUse of expression.matchAll(propertyPattern)) {
          const sourceProperty = propertyUse[1] ?? "";
          const sourceMemberId = resolver.resolveMember(source.typeId, sourceProperty);
          if (!sourceMemberId) {
            continue;
          }

          const key = `${source.typeId}\u0000${targetTypeId}`;
          const projection = mappedBySource.get(key) ?? {
            fromTypeId: source.typeId,
            toTypeId: targetTypeId,
            fromTypeName: source.typeName,
            toTypeName: targetTypeName,
            mappedProperties: [],
            offset: match.index ?? 0,
            evidence: ""
          };
          if (!projection.mappedProperties.some((item) => item.fromMemberId === sourceMemberId && item.toMemberId === targetMemberId)) {
            projection.mappedProperties.push({
              fromMemberId: sourceMemberId,
              toMemberId: targetMemberId,
              fromProperty: sourceProperty,
              toProperty: targetProperty
            });
          }
          mappedBySource.set(key, projection);
        }
      }
    }

    for (const projection of mappedBySource.values()) {
      if (projection.mappedProperties.length === 0) {
        continue;
      }
      projection.evidence = `Dapper result ${projection.fromTypeName} projects to ${projection.toTypeName}: ${projection.mappedProperties
        .slice(0, 6)
        .map((property) => `${property.fromProperty}->${property.toProperty}`)
        .join(", ")}`;
      projections.push(projection);
    }
  }

  return dedupeDapperProjectionBindings(projections);
}

function extractDapperResultVariables(
  text: string,
  filePath: string,
  resolveCSharpType: (typeText: string, filePath: string) => string | undefined
): DapperResultVariable[] {
  const variables: DapperResultVariable[] = [];
  const assignmentPattern = /\b(?:var|[A-Za-z_][A-Za-z0-9_.]*(?:<[^=;]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\([^;]*?\))?\s*(?:await\s+)?[\s\S]{0,160}?\.\s*(Query(?:Async|First(?:OrDefault)?Async|Single(?:OrDefault)?Async|First(?:OrDefault)?|Single(?:OrDefault)?)?)\s*</gu;
  assignmentPattern.lastIndex = 0;
  for (const match of text.matchAll(assignmentPattern)) {
    const genericStart = (match.index ?? 0) + match[0].length - 1;
    const generic = parseBalanced(text, genericStart, "<", ">");
    if (!generic) {
      continue;
    }
    const resultType = dapperResultType(splitTopLevel(generic.content, ",").map((argument) => argument.trim()).filter(Boolean));
    const resultTypeId = resultType ? resolveCSharpType(resultType, filePath) : undefined;
    if (!resultType || !resultTypeId) {
      continue;
    }
    variables.push({
      variableName: match[1] ?? "",
      typeId: resultTypeId,
      typeName: resultType,
      offset: match.index ?? 0
    });
  }
  return dedupeDapperResultVariables(variables);
}

function extractDapperIterationAliases(text: string, rowVariables: DapperResultVariable[]): Array<{ aliasName: string; typeId: string; typeName: string }> {
  const variableTypes = new Map(rowVariables.map((variable) => [variable.variableName, variable]));
  const aliases: Array<{ aliasName: string; typeId: string; typeName: string }> = [];
  const foreachPattern = /\bforeach\s*\(\s*(?:var|[A-Za-z_][A-Za-z0-9_.]*(?:<[^)>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([A-Za-z_][A-Za-z0-9_]*)/gu;
  foreachPattern.lastIndex = 0;
  for (const match of text.matchAll(foreachPattern)) {
    const source = variableTypes.get(match[2] ?? "");
    if (source && match[1]) {
      aliases.push({ aliasName: match[1], typeId: source.typeId, typeName: source.typeName });
    }
  }

  return aliases;
}

function extractCSharpStringAssignments(text: string): CSharpStringAssignment[] {
  const assignments: CSharpStringAssignment[] = [];
  const assignmentPattern = /\b(?:const\s+)?(?:var|string)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*/gu;
  assignmentPattern.lastIndex = 0;
  for (const match of text.matchAll(assignmentPattern)) {
    const literalStart = skipWhitespace(text, (match.index ?? 0) + match[0].length);
    const literal = parseCSharpStringLiteral(text, literalStart);
    if (!literal) {
      continue;
    }
    assignments.push({
      name: match[1] ?? "",
      value: literal.value,
      offset: match.index ?? 0
    });
  }
  return assignments;
}

function extractDapperCalls(text: string): DapperCall[] {
  return [...extractDapperQueryCalls(text), ...extractDapperExecuteCalls(text)]
    .sort((left, right) => left.offset - right.offset);
}

function extractDapperQueryCalls(text: string): DapperCall[] {
  const calls: DapperCall[] = [];
  const queryPattern = /\.\s*(Query(?:Async|First(?:OrDefault)?Async|Single(?:OrDefault)?Async|First(?:OrDefault)?|Single(?:OrDefault)?)?)\s*</gu;
  queryPattern.lastIndex = 0;
  for (const match of text.matchAll(queryPattern)) {
    const genericStart = (match.index ?? 0) + match[0].length - 1;
    const generic = parseBalanced(text, genericStart, "<", ">");
    if (!generic) {
      continue;
    }
    const parenStart = skipWhitespace(text, generic.endIndex + 1);
    if (text[parenStart] !== "(") {
      continue;
    }
    const args = parseBalanced(text, parenStart, "(", ")");
    if (!args) {
      continue;
    }
    calls.push({
      methodName: match[1] ?? "Query",
      genericArguments: splitTopLevel(generic.content, ",").map((argument) => argument.trim()).filter(Boolean),
      arguments: splitTopLevel(args.content, ",").map((argument) => argument.trim()).filter(Boolean),
      offset: match.index ?? 0,
      evidence: text.slice(match.index ?? 0, Math.min(text.length, args.endIndex + 1))
    });
  }
  return calls;
}

function extractDapperExecuteCalls(text: string): DapperCall[] {
  const calls: DapperCall[] = [];
  const executePattern = /\.\s*(Execute(?:Async|ScalarAsync|Scalar|ReaderAsync|Reader)?)\s*\(/gu;
  executePattern.lastIndex = 0;
  for (const match of text.matchAll(executePattern)) {
    const parenStart = (match.index ?? 0) + match[0].length - 1;
    const args = parseBalanced(text, parenStart, "(", ")");
    if (!args) {
      continue;
    }
    calls.push({
      methodName: match[1] ?? "Execute",
      genericArguments: [],
      arguments: splitTopLevel(args.content, ",").map((argument) => argument.trim()).filter(Boolean),
      offset: match.index ?? 0,
      evidence: text.slice(match.index ?? 0, Math.min(text.length, args.endIndex + 1))
    });
  }
  return calls;
}

function isDapperQueryMethod(methodName: string): boolean {
  return /^Query/u.test(methodName);
}

function dapperResultType(genericArguments: string[]): string | undefined {
  if (genericArguments.length === 0) {
    return undefined;
  }
  const rawType = genericArguments[genericArguments.length - 1];
  return rawType ? primaryModelTypeName(rawType) : undefined;
}

function inferDapperArgumentType(argument: string, text: string, callOffset: number): string | undefined {
  const trimmed = stripNamedArgument(argument.trim());
  const explicitNew = /^new\s+([A-Za-z_][A-Za-z0-9_.]*(?:<[^>{};]+>)?)/u.exec(trimmed);
  if (explicitNew?.[1]) {
    return primaryModelTypeName(explicitNew[1]);
  }

  const cast = /^\(\s*([A-Za-z_][A-Za-z0-9_.]*(?:<[^>{};]+>)?)\s*\)\s*([A-Za-z_][A-Za-z0-9_]*)$/u.exec(trimmed);
  const variableName = cast?.[2] ?? (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(trimmed) ? trimmed : undefined);
  if (cast?.[1]) {
    return primaryModelTypeName(cast[1]);
  }
  if (!variableName || ignoredArgumentNames.has(variableName.toLowerCase())) {
    return undefined;
  }

  return inferVariableType(text, variableName, callOffset);
}

const ignoredArgumentNames = new Set(["null", "true", "false", "cancellationtoken", "transaction", "commandtimeout", "commandtype"]);

function inferVariableType(text: string, variableName: string, beforeOffset: number): string | undefined {
  const escapedName = escapeRegExp(variableName);
  const before = text.slice(0, beforeOffset);
  const newAssignmentPattern = new RegExp(`\\bvar\\s+${escapedName}\\s*=\\s*new\\s+([A-Za-z_][A-Za-z0-9_.]*(?:<[^>{};]+>)?)`, "gu");
  const typedDeclarationPattern = new RegExp(`\\b([A-Z][A-Za-z0-9_.]*(?:<[^>{};]+>)?(?:\\[\\])?)\\s+${escapedName}\\b`, "gu");
  const matches: Array<{ typeName: string; offset: number }> = [];

  for (const match of before.matchAll(newAssignmentPattern)) {
    if (match[1]) {
      matches.push({ typeName: match[1], offset: match.index ?? 0 });
    }
  }
  for (const match of before.matchAll(typedDeclarationPattern)) {
    if (match[1] && !ignoredCSharpTypeNames.has(match[1])) {
      matches.push({ typeName: match[1], offset: match.index ?? 0 });
    }
  }

  const latest = matches.sort((left, right) => right.offset - left.offset)[0];
  return latest ? primaryModelTypeName(latest.typeName) : undefined;
}

const ignoredCSharpTypeNames = new Set(["String", "Task", "ValueTask", "CancellationToken", "CommandDefinition"]);

function commandDefinitionArgumentsFrom(argument: string | undefined): string[] | undefined {
  if (!argument) {
    return undefined;
  }
  const trimmed = argument.trim();
  const match = /^new\s+CommandDefinition\s*\(/u.exec(trimmed);
  if (!match) {
    return undefined;
  }
  const args = parseBalanced(trimmed, match[0].length - 1, "(", ")");
  return args ? splitTopLevel(args.content, ",").map((item) => stripNamedArgument(item.trim())).filter(Boolean) : undefined;
}

function resolveSqlArgument(argument: string | undefined, assignments: CSharpStringAssignment[], beforeOffset: number): string | undefined {
  if (!argument) {
    return undefined;
  }
  const trimmed = stripNamedArgument(argument.trim());
  const literal = parseCSharpStringLiteral(trimmed, skipWhitespace(trimmed, 0));
  if (literal) {
    return literal.value;
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(trimmed)) {
    return undefined;
  }

  return assignments
    .filter((assignment) => assignment.name === trimmed && assignment.offset < beforeOffset)
    .sort((left, right) => right.offset - left.offset)[0]?.value;
}

function stripNamedArgument(argument: string): string {
  return argument.replace(/^[A-Za-z_][A-Za-z0-9_]*\s*:\s*/u, "").trim();
}

function dedupeDapperTypeBindings(bindings: DapperTypeBinding[]): DapperTypeBinding[] {
  const seen = new Set<string>();
  return bindings.filter((binding) => {
    const key = `${binding.relationshipType}\u0000${binding.normalizedTableName}\u0000${binding.typeId}\u0000${binding.offset}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeDapperResultVariables(variables: DapperResultVariable[]): DapperResultVariable[] {
  const seen = new Set<string>();
  return variables.filter((variable) => {
    const key = `${variable.variableName}\u0000${variable.typeId}\u0000${variable.offset}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeDapperProjectionBindings(projections: DapperProjectionBinding[]): DapperProjectionBinding[] {
  const seen = new Set<string>();
  return projections.filter((projection) => {
    const key = `${projection.fromTypeId}\u0000${projection.toTypeId}\u0000${projection.offset}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function tableSymbol(id: string, tableName: string, file: string, range: SourceRange): SymbolRecord {
  return {
    recordType: "symbol",
    id,
    name: tableName,
    fullyQualifiedName: tableName,
    kind: "databaseTable",
    language: "sql",
    file,
    range,
    patterns: tablePatterns(tableName),
    summary: `Database table referenced by SQL: ${tableName}`,
    confidence: 0.82
  };
}

function tablePatterns(tableName: string): string[] {
  const patterns = ["database-table"];
  if (/\btemplate|_templates\b/iu.test(tableName)) {
    patterns.push("template-table");
  }
  if (/\bobject(?:types?|categories?)|taxonomy|typecode\b/iu.test(tableName)) {
    patterns.push("taxonomy-table");
  }
  return patterns;
}

function databaseRowSymbol(rowFact: InsertedRowFact, file: string, range: SourceRange): SymbolRecord {
  return {
    recordType: "symbol",
    id: rowFact.rowId,
    name: rowFact.rowLabel,
    fullyQualifiedName: `${rowFact.normalizedTableName}.${rowFact.rowLabel}`,
    kind: "databaseRow",
    language: "sql",
    file,
    range,
    patterns: ["database-row", "seed-row"],
    summary: `Seeded row in ${rowFact.normalizedTableName}: ${rowFact.identifierColumn}=${rowFact.identifierValue}${rowFact.typeCodeValue ? `, type_code=${rowFact.typeCodeValue}` : ""}`,
    confidence: 0.82
  };
}

function sqlTypeCodeValueSymbol(id: string, rowFact: InsertedRowFact, file: string, range: SourceRange): SymbolRecord {
  return {
    recordType: "symbol",
    id,
    name: rowFact.typeCodeValue ?? id.replace(/^type-code:/u, ""),
    fullyQualifiedName: rowFact.typeCodeValue,
    kind: "typeCodeValue",
    language: "sql",
    file,
    range,
    patterns: ["type-code-value", "seed-row-type-code"],
    summary: `Type-code value ${rowFact.typeCodeValue} used by seeded row ${rowFact.rowLabel}`,
    confidence: 0.78
  };
}

function extractInsertedRowFacts(text: string): InsertedRowFact[] {
  const rows: InsertedRowFact[] = [];
  const insertPattern = /\bINSERT\s+INTO\s+((?:"[^"]+"|\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|\[[^\]]+\]|[A-Za-z_][\w$]*))?)\s*\(([^)]{1,800})\)\s*VALUES\s*\(([^)]{1,1000})\)/giu;
  insertPattern.lastIndex = 0;
  for (const match of text.matchAll(insertPattern)) {
    const normalizedTableName = normalizeTableName(match[1] ?? "");
    if (!isPlausibleTableName(normalizedTableName)) {
      continue;
    }

    const columns = (match[2] ?? "")
      .split(",")
      .map((column) => normalizeColumnName(column))
      .filter(Boolean);
    const values = parseSqlValueList(match[3] ?? "").map(normalizeSqlLiteral);
    if (!columns.length || columns.length !== values.length || values.some((value) => value === undefined)) {
      continue;
    }

    const valueByColumn = new Map(columns.map((column, index) => [column, values[index] ?? ""]));
    const identifierColumn = ["uid", "sid", "key", "slug", "code", "name"].find((column) => isStableIdentifierValue(valueByColumn.get(column)));
    if (!identifierColumn) {
      continue;
    }
    const identifierValue = valueByColumn.get(identifierColumn) ?? "";
    const typeCodeValue = valueByColumn.get("type_code") ?? valueByColumn.get("typecode");
    const rowLabel = `${identifierColumn}:${identifierValue}`;
    rows.push({
      normalizedTableName,
      rowId: `row:${normalizedTableName}:${identifierColumn}:${stableIdPart(identifierValue.toLowerCase())}`,
      rowLabel,
      identifierColumn,
      identifierValue,
      typeCodeValue: typeCodeValue && /^-?\d+$/u.test(typeCodeValue) ? typeCodeValue : undefined,
      offset: match.index ?? 0,
      evidence: compactEvidence(match[0])
    });
  }

  return rows;
}

function normalizeColumnName(column: string): string {
  return column
    .trim()
    .replace(/^["[]|["\]]$/gu, "")
    .toLowerCase();
}

function parseSqlValueList(valueList: string): string[] {
  const values: string[] = [];
  let current = "";
  let inSingleQuote = false;
  for (let index = 0; index < valueList.length; index += 1) {
    const char = valueList[index];
    const next = valueList[index + 1];
    if (char === "'" && next === "'") {
      current += "''";
      index += 1;
      continue;
    }
    if (char === "'") {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }
    if (char === "," && !inSingleQuote) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) {
    values.push(current.trim());
  }
  return values;
}

function normalizeSqlLiteral(rawValue: string): string | undefined {
  const trimmed = rawValue.trim();
  if (/^-?\d+$/u.test(trimmed)) {
    return trimmed;
  }
  if (/^N?'(?:[^']|'')*'$/iu.test(trimmed)) {
    const withoutPrefix = trimmed.replace(/^N'/iu, "'").slice(1, -1);
    return withoutPrefix.replace(/''/gu, "'");
  }
  return undefined;
}

function isStableIdentifierValue(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9][A-Za-z0-9_.:-]{1,120}$/u.test(value));
}

function inferGeneratedTableName(filePath: string, text: string): string | undefined {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").pop() ?? "";
  const fileMatch = /^(.+)TableDataModel\.cs$/u.exec(fileName);
  const classMatch = /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)TableDataModel\b/u.exec(text);
  const modelName = classMatch?.[1] ?? fileMatch?.[1];
  if (!modelName) {
    return undefined;
  }

  const tableName = pascalToSnake(modelName);
  if (!tableName || !isPlausibleTableName(tableName)) {
    return undefined;
  }
  return `public.${tableName}`;
}

function pascalToSnake(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1_$2")
    .replace(/__+/gu, "_")
    .toLowerCase();
}

function normalizeTableName(rawTableName: string): string {
  return rawTableName
    .replace(/\s*\.\s*/gu, ".")
    .split(".")
    .map((part) => part.trim().replace(/^["[]|["\]]$/gu, ""))
    .filter(Boolean)
    .join(".")
    .toLowerCase();
}

function isPlausibleTableName(tableName: string): boolean {
  if (!tableName || ignoredTableNames.has(tableName)) {
    return false;
  }
  if (!/^[a-z_][a-z0-9_$]*(?:\.[a-z_][a-z0-9_$]*)?$/u.test(tableName)) {
    return false;
  }
  return !/^(select|where|order|group|having|limit|offset|values)$/u.test(tableName);
}

function statementWindow(text: string, offset: number): string {
  const before = Math.max(text.lastIndexOf(";", offset), text.lastIndexOf("\n\n", offset));
  const afterSemicolon = text.indexOf(";", offset);
  const afterBlankLine = text.indexOf("\n\n", offset);
  const afterCandidates = [afterSemicolon, afterBlankLine].filter((value) => value >= 0);
  const after = afterCandidates.length ? Math.min(...afterCandidates) : Math.min(text.length, offset + 500);
  return text.slice(Math.max(0, before + 1), Math.min(text.length, after + 1));
}

function compactEvidence(statement: string): string {
  return statement
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 220);
}

function parseCSharpStringLiteral(text: string, offset: number): { value: string; endIndex: number } | undefined {
  let index = skipWhitespace(text, offset);
  let isVerbatim = false;
  if (text[index] === "$" || text[index] === "@") {
    const prefixStart = index;
    while (text[index] === "$" || text[index] === "@") {
      isVerbatim = isVerbatim || text[index] === "@";
      index += 1;
    }
    if (index - prefixStart > 2) {
      return undefined;
    }
  }
  if (text[index] !== "\"") {
    return undefined;
  }

  let value = "";
  index += 1;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (isVerbatim) {
      if (char === "\"" && next === "\"") {
        value += "\"";
        index += 2;
        continue;
      }
      if (char === "\"") {
        return { value, endIndex: index };
      }
      value += char;
      index += 1;
      continue;
    }

    if (char === "\\") {
      value += next ?? "";
      index += 2;
      continue;
    }
    if (char === "\"") {
      return { value, endIndex: index };
    }
    value += char;
    index += 1;
  }

  return undefined;
}

function parseBalanced(text: string, openIndex: number, open: string, close: string): { content: string; endIndex: number } | undefined {
  if (text[openIndex] !== open) {
    return undefined;
  }

  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\"" || ((char === "$" || char === "@") && (text[index + 1] === "\"" || text[index + 1] === "@" || text[index + 1] === "$"))) {
      const skipped = skipCSharpString(text, index);
      if (skipped > index) {
        index = skipped;
        continue;
      }
    }
    if (char === "'") {
      const skipped = skipCSharpChar(text, index);
      if (skipped > index) {
        index = skipped;
        continue;
      }
    }
    if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return {
          content: text.slice(openIndex + 1, index),
          endIndex: index
        };
      }
    }
  }

  return undefined;
}

function splitTopLevel(text: string, delimiter: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let angleDepth = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\"" || ((char === "$" || char === "@") && (text[index + 1] === "\"" || text[index + 1] === "@" || text[index + 1] === "$"))) {
      const skipped = skipCSharpString(text, index);
      if (skipped > index) {
        index = skipped;
        continue;
      }
    }
    if (char === "'") {
      const skipped = skipCSharpChar(text, index);
      if (skipped > index) {
        index = skipped;
        continue;
      }
    }
    if (char === "<") angleDepth += 1;
    else if (char === ">") angleDepth = Math.max(0, angleDepth - 1);
    else if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "{") braceDepth += 1;
    else if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (char === "[") bracketDepth += 1;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === delimiter && angleDepth === 0 && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(text.slice(start));
  return parts;
}

function skipCSharpString(text: string, offset: number): number {
  const literal = parseCSharpStringLiteral(text, offset);
  return literal ? literal.endIndex : offset;
}

function skipCSharpChar(text: string, offset: number): number {
  for (let index = offset + 1; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === "'") {
      return index;
    }
  }
  return offset;
}

function skipWhitespace(text: string, offset: number): number {
  let index = offset;
  while (index < text.length && /\s/u.test(text[index])) {
    index += 1;
  }
  return index;
}

function primaryModelTypeName(typeText: string): string | undefined {
  let current = typeText
    .trim()
    .replace(/^global::/u, "")
    .replace(/\?$/u, "")
    .replace(/\[\]$/u, "")
    .trim();

  for (let guard = 0; guard < 6; guard += 1) {
    const generic = /^([A-Za-z_][A-Za-z0-9_.]*)\s*<(.+)>$/u.exec(current);
    if (!generic) {
      break;
    }
    const wrapper = generic[1]?.split(".").pop() ?? "";
    const args = splitTopLevel(generic[2] ?? "", ",").map((argument) => argument.trim()).filter(Boolean);
    if (["Task", "ValueTask", "IEnumerable", "IAsyncEnumerable", "IReadOnlyList", "IReadOnlyCollection", "ICollection", "IList", "List", "HashSet", "Nullable"].includes(wrapper) && args[0]) {
      current = args[0];
      continue;
    }
    current = args[args.length - 1] ?? current;
  }

  current = current.replace(/\?$/u, "").replace(/\[\]$/u, "").trim();
  if (!current || isPrimitiveTypeName(current)) {
    return undefined;
  }
  return current;
}

function createCSharpTypeResolver(symbols: SymbolRecord[]): CSharpTypeResolver {
  const candidates = symbols.filter((symbol) =>
    symbol.language === "csharp" &&
    ["class", "record", "struct", "interface", "enum"].includes(symbol.kind.toLowerCase())
  );
  const members = symbols.filter((symbol) =>
    symbol.language === "csharp" &&
    ["property", "field"].includes(symbol.kind.toLowerCase())
  );
  const byFqn = new Map<string, SymbolRecord>();
  const byName = new Map<string, SymbolRecord[]>();
  const membersByParent = new Map<string, Map<string, SymbolRecord>>();
  for (const symbol of candidates) {
    if (symbol.fullyQualifiedName) {
      byFqn.set(normalizeCSharpTypeName(symbol.fullyQualifiedName), symbol);
    }
    const list = byName.get(symbol.name) ?? [];
    list.push(symbol);
    byName.set(symbol.name, list);
  }
  for (const member of members) {
    const parentId = parentCSharpSymbolId(member.id);
    if (!parentId) {
      continue;
    }
    addMemberByParent(membersByParent, parentId, member);

    const parentSimpleName = parentId.split(".").pop() ?? "";
    for (const candidate of candidates) {
      if (candidate.file === member.file && candidate.name === parentSimpleName && candidate.id !== parentId) {
        addMemberByParent(membersByParent, candidate.id, member);
      }
    }
  }

  const resolveType = (typeText: string, filePath: string): string | undefined => {
    const primary = primaryModelTypeName(typeText);
    if (!primary) {
      return undefined;
    }
    const normalized = normalizeCSharpTypeName(primary);
    const exact = byFqn.get(normalized);
    if (exact) {
      return exact.id;
    }

    const simpleName = normalized.split(".").pop() ?? normalized;
    const simpleCandidates = byName.get(simpleName) ?? [];
    if (simpleCandidates.length === 1) {
      return simpleCandidates[0]?.id;
    }

    const project = projectSegment(filePath);
    const sameProject = simpleCandidates.filter((symbol) => project && projectSegment(symbol.file) === project);
    if (sameProject.length === 1) {
      return sameProject[0]?.id;
    }

    return undefined;
  };

  return {
    resolveType,
    resolveMember: (typeId: string, memberName: string): string | undefined => {
      return membersByParent.get(typeId)?.get(memberName)?.id;
    }
  };
}

function addMemberByParent(
  membersByParent: Map<string, Map<string, SymbolRecord>>,
  parentId: string,
  member: SymbolRecord
): void {
  const byMemberName = membersByParent.get(parentId) ?? new Map<string, SymbolRecord>();
  byMemberName.set(member.name, member);
  membersByParent.set(parentId, byMemberName);
}

function normalizeCSharpTypeName(typeName: string): string {
  return typeName.replace(/^global::/u, "").replace(/\s+/gu, "");
}

function parentCSharpSymbolId(symbolId: string): string | undefined {
  if (!symbolId.startsWith("symbol:csharp:")) {
    return undefined;
  }
  const lastDot = symbolId.lastIndexOf(".");
  if (lastDot <= "symbol:csharp:".length) {
    return undefined;
  }
  return symbolId.slice(0, lastDot);
}

function projectSegment(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.?\//u, "");
  const first = normalized.split("/").filter(Boolean)[0];
  return first && first !== normalized ? first : undefined;
}

function isPrimitiveTypeName(typeName: string): boolean {
  return /^(string|String|int|Int32|long|Int64|short|Int16|bool|Boolean|double|Double|decimal|Decimal|float|Single|object|Object|Guid|DateTime|DateOnly|TimeOnly|CancellationToken)$/u.test(typeName);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function dedupeOccurrences(occurrences: TableOccurrence[]): TableOccurrence[] {
  const seen = new Set<string>();
  return occurrences.filter((occurrence) => {
    const key = `${occurrence.operation}\u0000${occurrence.normalizedTableName}\u0000${occurrence.offset}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function offsetRange(lineStarts: number[], offset: number): SourceRange {
  let lineIndex = 0;
  for (let index = 0; index < lineStarts.length; index += 1) {
    if (lineStarts[index] > offset) {
      break;
    }
    lineIndex = index;
  }
  const startLine = lineIndex + 1;
  const startColumn = offset - lineStarts[lineIndex] + 1;
  return {
    startLine,
    startColumn,
    endLine: startLine,
    endColumn: startColumn + 1
  };
}

function stableIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 120);
}
