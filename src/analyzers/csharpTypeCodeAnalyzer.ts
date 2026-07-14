import * as fs from "fs/promises";
import * as path from "path";
import { FileRecord, RelationshipRecord, SourceRange, SymbolRecord } from "../model/records";

export interface CSharpTypeCodeAnalyzerResult {
  symbols: SymbolRecord[];
  relationships: RelationshipRecord[];
}

interface TypeCodeMember {
  parentName: string;
  parentFqn: string;
  memberName: string;
  value: string;
  offset: number;
  evidence: string;
  kind: "enum-member" | "field";
}

const enumPattern = /\benum\s+([A-Za-z_][\w]*)\s*\{([\s\S]*?)\}/gu;
const enumMemberPattern = /\b([A-Za-z_][\w]*)\s*=\s*(-?\d+)\b/gu;
const typeCodeFilePattern = /\btype[-_ ]?codes?\b|typecode|typecodes/iu;

export async function analyzeCSharpTypeCodeContracts(workspaceRoot: string, files: FileRecord[]): Promise<CSharpTypeCodeAnalyzerResult> {
  const symbols = new Map<string, SymbolRecord>();
  const relationships = new Map<string, RelationshipRecord>();

  for (const file of files.filter((candidate) => candidate.extension === ".cs")) {
    const fullPath = path.join(workspaceRoot, file.path);
    let text: string;
    try {
      text = await fs.readFile(fullPath, "utf8");
    } catch {
      continue;
    }

    if (!typeCodeFilePattern.test([file.path, text].join(" "))) {
      continue;
    }

    const namespaceName = readNamespaceName(text);
    const lineStarts = buildLineStarts(text);
    for (const member of extractEnumTypeCodeMembers(text, namespaceName)) {
      const range = offsetRange(lineStarts, member.offset);
      const parentId = csharpSymbolId(member.parentFqn);
      const memberId = csharpSymbolId(`${member.parentFqn}.${member.memberName}`);
      const valueId = typeCodeValueNodeId(member.value);

      addSymbol(symbols, typeCodeMemberSymbol(memberId, member, file.path, range));
      addSymbol(symbols, typeCodeValueSymbol(valueId, member, file.path, range));
      addRelationship(relationships, relationship(parentId, memberId, "HAS_TYPE_CODE_MEMBER", file.path, range, member.evidence, 0.84));
      addRelationship(relationships, relationship(memberId, valueId, "DEFINES_TYPE_CODE", file.path, range, member.evidence, 0.9));
      addRelationship(relationships, relationship(parentId, valueId, "DEFINES_TYPE_CODE", file.path, range, member.evidence, 0.78));
    }
  }

  return {
    symbols: [...symbols.values()].sort((left, right) => left.id.localeCompare(right.id)),
    relationships: [...relationships.values()].sort((left, right) => left.id.localeCompare(right.id))
  };
}

function extractEnumTypeCodeMembers(text: string, namespaceName: string): TypeCodeMember[] {
  const members: TypeCodeMember[] = [];
  enumPattern.lastIndex = 0;
  for (const enumMatch of text.matchAll(enumPattern)) {
    const parentName = enumMatch[1] ?? "";
    const body = enumMatch[2] ?? "";
    if (!parentName || !typeCodeFilePattern.test(parentName)) {
      continue;
    }

    const bodyOffset = (enumMatch.index ?? 0) + enumMatch[0].indexOf(body);
    const parentFqn = namespaceName ? `${namespaceName}.${parentName}` : parentName;
    enumMemberPattern.lastIndex = 0;
    for (const memberMatch of body.matchAll(enumMemberPattern)) {
      const memberName = memberMatch[1] ?? "";
      const value = memberMatch[2] ?? "";
      if (!memberName || !value) {
        continue;
      }

      members.push({
        parentName,
        parentFqn,
        memberName,
        value,
        offset: bodyOffset + (memberMatch.index ?? 0),
        evidence: `${parentName}.${memberName} = ${value}`,
        kind: "enum-member"
      });
    }
  }
  return members;
}

function readNamespaceName(text: string): string {
  const match = /\bnamespace\s+([A-Za-z_][\w.]*)(?:\s*;|\s*\{)/u.exec(text);
  return match?.[1] ?? "";
}

function typeCodeMemberSymbol(id: string, member: TypeCodeMember, file: string, range: SourceRange): SymbolRecord {
  return {
    recordType: "symbol",
    id,
    name: member.memberName,
    fullyQualifiedName: `${member.parentFqn}.${member.memberName}`,
    kind: member.kind,
    language: "csharp",
    file,
    range,
    patterns: ["type-code-contract-member", "csharp-enum-member"],
    summary: `Type-code contract member ${member.parentName}.${member.memberName} = ${member.value}`,
    confidence: 0.9
  };
}

function typeCodeValueSymbol(id: string, member: TypeCodeMember, file: string, range: SourceRange): SymbolRecord {
  return {
    recordType: "symbol",
    id,
    name: member.value,
    fullyQualifiedName: member.value,
    kind: "typeCodeValue",
    language: "csharp",
    file,
    range,
    patterns: ["type-code-value"],
    summary: `Type-code value ${member.value} defined by ${member.parentName}.${member.memberName}`,
    confidence: 0.88
  };
}

function relationship(from: string, to: string, type: string, file: string, range: SourceRange, evidence: string, confidence: number): RelationshipRecord {
  return {
    recordType: "relationship",
    id: [
      "relationship:csharp-type-code",
      type.toLowerCase(),
      stableIdPart(from),
      stableIdPart(to)
    ].join(":"),
    from,
    to,
    type,
    file,
    range,
    evidence,
    confidence
  };
}

function csharpSymbolId(fullyQualifiedName: string): string {
  return `symbol:csharp:${fullyQualifiedName}`;
}

function typeCodeValueNodeId(value: string): string {
  return `type-code:${value}`;
}

function addSymbol(symbols: Map<string, SymbolRecord>, symbol: SymbolRecord): void {
  if (!symbols.has(symbol.id)) {
    symbols.set(symbol.id, symbol);
  }
}

function addRelationship(relationships: Map<string, RelationshipRecord>, relationshipRecord: RelationshipRecord): void {
  if (!relationships.has(relationshipRecord.id)) {
    relationships.set(relationshipRecord.id, relationshipRecord);
  }
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
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const lineIndex = Math.max(0, high);
  const column = offset - lineStarts[lineIndex] + 1;
  return {
    startLine: lineIndex + 1,
    startColumn: column,
    endLine: lineIndex + 1,
    endColumn: column + 1
  };
}

function stableIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/gu, "_");
}
