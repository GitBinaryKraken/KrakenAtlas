import { ReactDeclaration, ReactMember, ReactSource, TypeScriptInferredProp } from "./reactAnalyzerTypes";
import { braceDepthAt, findMatchingBrace, IndexedMatch, matchAll } from "./reactSourceText";
import { slug } from "./reactTypeText";
import { rangeFromIndex } from "./textLocation";

export function discoverInterfaceMembers(source: ReactSource, declaration: ReactDeclaration): ReactMember[] {
  if (declaration.kind === "enum") {
    return discoverEnumMembers(source, declaration);
  }
  if (declaration.kind !== "props" && declaration.kind !== "interface") {
    return [];
  }
  if (declaration.inferredProps?.length) {
    return declaration.inferredProps.map((prop) => inferredPropMember(declaration, prop));
  }

  const members: ReactMember[] = [];
  const seen = new Set<string>();
  for (const match of matchAll(declaration.body, /(^|[;\n])\s*(readonly\s+)?([A-Za-z_$][\w$]*)(\?)?\s*:\s*([^;\n]+)/g)) {
    const name = match[3];
    const textAfterBoundary = match[0].slice(match[1].length);
    const offsetWithinMatch = textAfterBoundary.search(/\S/u);
    const memberBodyOffset = match.index + match[1].length + Math.max(0, offsetWithinMatch);
    if (braceDepthAt(declaration.body, memberBodyOffset) !== 0) {
      continue;
    }

    if (seen.has(name)) {
      continue;
    }

    const snippet = textAfterBoundary.trim();
    const snippetStart = declaration.bodyStart + memberBodyOffset;
    const typeName = cleanTypeName(match[5]);
    members.push(reactMember(source, declaration, name, snippet, snippetStart, typeName, Boolean(match[4]), Boolean(match[2])));
    members.push(...discoverNestedObjectMembers(source, declaration, name, match, Boolean(match[4]), Boolean(match[2])));
    seen.add(name);
  }
  for (const member of discoverIndexSignatureMembers(source, declaration)) {
    if (seen.has(member.name)) {
      continue;
    }
    members.push(member);
    seen.add(member.name);
  }

  return members;
}

function discoverIndexSignatureMembers(source: ReactSource, declaration: ReactDeclaration): ReactMember[] {
  const members: ReactMember[] = [];
  for (const match of matchAll(declaration.body, /(^|[;\n])\s*(readonly\s+)?\[\s*([A-Za-z_$][\w$]*)\s*:\s*([^\]]+)\]\s*:\s*([^;\n]+)/g)) {
    const textAfterBoundary = match[0].slice(match[1].length);
    const offsetWithinMatch = textAfterBoundary.search(/\S/u);
    const memberBodyOffset = match.index + match[1].length + Math.max(0, offsetWithinMatch);
    if (braceDepthAt(declaration.body, memberBodyOffset) !== 0) {
      continue;
    }

    const keyName = match[3];
    const keyType = cleanTypeName(match[4]);
    const name = `[${keyName}: ${keyType}]`;
    const snippet = textAfterBoundary.trim();
    const snippetStart = declaration.bodyStart + memberBodyOffset;
    members.push({
      id: `${declaration.id}.${slug(name)}`,
      parentId: declaration.id,
      parentName: declaration.name,
      name,
      kind: "property",
      file: declaration.file,
      language: declaration.language,
      range: rangeFromIndex(source.text, snippetStart, snippet.length),
      declaration: snippet,
      typeName: cleanTypeName(match[5]),
      optional: false,
      readonly: Boolean(match[2]),
      indexSignature: true,
      keyType
    });
  }
  return members;
}

function inferredPropMember(declaration: ReactDeclaration, prop: TypeScriptInferredProp): ReactMember {
  return {
    id: `${declaration.id}.${slug(prop.name)}`,
    parentId: declaration.id,
    parentName: declaration.name,
    name: prop.name,
    kind: "property",
    file: declaration.file,
    language: declaration.language,
    range: prop.range,
    declaration: prop.declaration,
    typeName: prop.typeName,
    optional: prop.optional,
    readonly: prop.readonly,
    rest: prop.rest
  };
}

function discoverEnumMembers(source: ReactSource, declaration: ReactDeclaration): ReactMember[] {
  const members: ReactMember[] = [];
  const seen = new Set<string>();
  for (const match of matchAll(declaration.body, /(^|[,\n])\s*([A-Za-z_$][\w$]*)(?:\s*=\s*([^,\n]+))?/g)) {
    const name = match[2];
    const textAfterBoundary = match[0].slice(match[1].length);
    const offsetWithinMatch = textAfterBoundary.search(/\S/u);
    const memberBodyOffset = match.index + match[1].length + Math.max(0, offsetWithinMatch);
    if (braceDepthAt(declaration.body, memberBodyOffset) !== 0 || seen.has(name)) {
      continue;
    }

    const snippet = textAfterBoundary.trim().replace(/,$/u, "");
    const snippetStart = declaration.bodyStart + memberBodyOffset;
    const initializer = match[3]?.trim().replace(/,$/u, "");
    members.push(reactMember(source, declaration, name, snippet, snippetStart, initializer, false, true, "enum-member"));
    seen.add(name);
  }
  return members;
}

function discoverNestedObjectMembers(
  source: ReactSource,
  declaration: ReactDeclaration,
  parentName: string,
  parentMatch: IndexedMatch,
  parentOptional: boolean,
  parentReadonly: boolean
): ReactMember[] {
  const nestedMembers: ReactMember[] = [];
  const openBraceInMatch = parentMatch[0].lastIndexOf("{");
  if (openBraceInMatch < 0) {
    return nestedMembers;
  }

  const openBrace = parentMatch.index + openBraceInMatch;
  const closeBrace = findMatchingBrace(declaration.body, openBrace);
  if (closeBrace < 0) {
    return nestedMembers;
  }

  const nestedBody = declaration.body.slice(openBrace + 1, closeBrace);
  const seen = new Set<string>();
  for (const match of matchAll(nestedBody, /(^|[;\n])\s*(readonly\s+)?([A-Za-z_$][\w$]*)(\?)?\s*:\s*([^;\n]+)/g)) {
    const nestedName = match[3];
    const textAfterBoundary = match[0].slice(match[1].length);
    const offsetWithinMatch = textAfterBoundary.search(/\S/u);
    const nestedOffset = match.index + match[1].length + Math.max(0, offsetWithinMatch);
    if (braceDepthAt(nestedBody, nestedOffset) !== 0 || seen.has(nestedName)) {
      continue;
    }

    const fullName = `${parentName}.${nestedName}`;
    const snippet = textAfterBoundary.trim();
    const snippetStart = declaration.bodyStart + openBrace + 1 + nestedOffset;
    const typeName = cleanTypeName(match[5]);
    nestedMembers.push(reactMember(
      source,
      declaration,
      fullName,
      snippet,
      snippetStart,
      typeName,
      parentOptional || Boolean(match[4]),
      parentReadonly || Boolean(match[2])
    ));
    seen.add(nestedName);
  }

  return nestedMembers;
}

function reactMember(
  source: ReactSource,
  declaration: ReactDeclaration,
  name: string,
  snippet: string,
  snippetStart: number,
  typeName: string | undefined,
  optional: boolean,
  readonly: boolean,
  kind: ReactMember["kind"] = "property"
): ReactMember {
  return {
    id: `${declaration.id}.${slug(name)}`,
    parentId: declaration.id,
    parentName: declaration.name,
    name,
    kind,
    file: declaration.file,
    language: declaration.language,
    range: rangeFromIndex(source.text, snippetStart, snippet.length),
    declaration: snippet,
    typeName,
    optional,
    readonly
  };
}

function cleanTypeName(value: string): string {
  const cleaned = value.trim().replace(/[,\r]+$/u, "").trim();
  return cleaned === "{" ? "object" : cleaned;
}
