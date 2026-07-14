import { queryTerms, queryWantsTemplateBackedDetail } from "./queryText";
import { booleanValue, numberValue, placeholders, stringValue, uniqueStrings } from "./queryUtils";
import type { FileRecommendation } from "./whereToAddRanking";

export type GuidanceRowReader = (sql: string, params?: unknown[]) => Array<Record<string, unknown>>;

export function enrichRecommendationsWithNodeGuidance(
  query: string,
  recommendations: FileRecommendation[],
  readRows: GuidanceRowReader,
  readJson: GuidanceRowReader
): FileRecommendation[] {
  if (recommendations.length === 0) {
    return recommendations;
  }

  try {
    const files = recommendations.map((recommendation) => recommendation.file);
    const fileNodeIds = files.map((file) => `file:${file}`);
    const roleRows = readRows(
      `SELECT node_id, role, MAX(confidence) AS confidence
       FROM node_roles
       WHERE node_id IN (${placeholders(fileNodeIds.length)})
       GROUP BY node_id, role
       ORDER BY confidence DESC, role;`,
      fileNodeIds
    );
    const projectRows = readRows(
      `SELECT node_id, project, role, SUM(evidence_count) AS evidence_count
       FROM node_projects
       WHERE node_id IN (${placeholders(fileNodeIds.length)})
       GROUP BY node_id, project, role
       ORDER BY node_id, role, project;`,
      fileNodeIds
    );
    const typeSymbols = readJson(
      `SELECT json FROM symbols
       WHERE file IN (${placeholders(files.length)})
         AND kind IN ('class', 'record', 'struct', 'interface', 'enum')
       ORDER BY file, start_line
       LIMIT 160;`,
      files
    );
    const typeSymbolIds = typeSymbols.map((symbol) => stringValue(symbol.id)).filter(Boolean);
    const symbolRoleRows = typeSymbolIds.length ? readRows(
      `SELECT node_id, role, MAX(confidence) AS confidence
       FROM node_roles
       WHERE node_id IN (${placeholders(typeSymbolIds.length)})
       GROUP BY node_id, role
       ORDER BY confidence DESC, role;`,
      typeSymbolIds
    ) : [];
    const memberRows = typeSymbolIds.length ? readRows(
      `SELECT node_id, member_name, type_name, required, nullable
       FROM node_members
       WHERE node_id IN (${placeholders(typeSymbolIds.length)})
       ORDER BY node_id, member_name
       LIMIT 500;`,
      typeSymbolIds
    ) : [];

    const rolesByFile = groupRows(roleRows, (row) => stringValue(row.node_id).replace(/^file:/u, ""));
    const projectsByFile = groupRows(projectRows, (row) => stringValue(row.node_id).replace(/^file:/u, ""));
    const symbolsByFile = groupRows(typeSymbols, (symbol) => stringValue(symbol.file));
    const rolesBySymbol = groupRows(symbolRoleRows, (row) => stringValue(row.node_id));
    const membersBySymbol = groupRows(memberRows, (row) => stringValue(row.node_id));
    const queryTermSet = new Set(queryTerms(query));
    const wantsTemplateBackedDetail = queryWantsTemplateBackedDetail(query.toLowerCase());

    for (const recommendation of recommendations) {
      const fileRoles = uniqueStrings((rolesByFile.get(recommendation.file) ?? [])
        .sort((left, right) => numberValue(right.confidence) - numberValue(left.confidence) || stringValue(left.role).localeCompare(stringValue(right.role)))
        .map((row) => stringValue(row.role))
        .filter(Boolean))
        .slice(0, 5);
      const fileProjectRows = projectsByFile.get(recommendation.file) ?? [];
      const projects = uniqueStrings(fileProjectRows.map((row) => stringValue(row.project)).filter(Boolean));
      const declaredProject = fileProjectRows.find((row) => stringValue(row.role) === "declared")?.project;
      const fileSymbols = symbolsByFile.get(recommendation.file) ?? [];
      const symbolRoles = uniqueStrings(fileSymbols.flatMap((symbol) =>
        (rolesBySymbol.get(stringValue(symbol.id)) ?? []).map((row) => stringValue(row.role)).filter(Boolean)
      )).slice(0, 6);
      const memberHints = selectMemberHints(fileSymbols, rolesBySymbol, membersBySymbol, queryTermSet);

      if (fileRoles.length) {
        recommendation.nodeRoles = fileRoles;
      }
      if (projects.length || declaredProject) {
        recommendation.projectHint = {
          project: stringValue(declaredProject) || projects[0],
          projects
        };
      }
      if (symbolRoles.length) {
        recommendation.symbolRoles = symbolRoles;
      }
      if (memberHints.length) {
        recommendation.memberHints = memberHints;
      }
      if (wantsTemplateBackedDetail) {
        const sourceOfTruthRoles = fileRoles.filter((role) =>
          ["admin-config-surface", "definition-source", "taxonomy-manager", "object-type-manager", "template-admin-surface", "template-table-model", "type-code-editor"].includes(role)
        );
        const contractRoles = symbolRoles.filter((role) => role === "type-code-contract");
        if (contractRoles.length) {
          recommendation.score += 10;
          const reason = "Backing contract role match: type-code-contract.";
          if (!recommendation.reasons.includes(reason)) {
            recommendation.reasons.push(reason);
          }
        }
        if (sourceOfTruthRoles.length) {
          recommendation.score += 24 + sourceOfTruthRoles.length * 3;
          const reason = `Source-of-truth role match: ${sourceOfTruthRoles.slice(0, 3).join(", ")}.`;
          if (!recommendation.reasons.includes(reason)) {
            recommendation.reasons.push(reason);
          }
        }
      }
    }

    return recommendations.sort((left, right) => Number(Boolean(right.strongAnchor)) - Number(Boolean(left.strongAnchor)) || right.score - left.score || left.file.localeCompare(right.file));
  } catch {
    return recommendations;
  }
}

function selectMemberHints(
  fileSymbols: Array<Record<string, unknown>>,
  rolesBySymbol: Map<string, Array<Record<string, unknown>>>,
  membersBySymbol: Map<string, Array<Record<string, unknown>>>,
  queryTermSet: Set<string>
): Array<{ owner: string; name: string; typeName?: string; required?: boolean; nullable?: boolean }> {
  const rows = fileSymbols.flatMap((symbol) => {
    const symbolId = stringValue(symbol.id);
    const owner = stringValue(symbol.name);
    const symbolRoles = (rolesBySymbol.get(symbolId) ?? []).map((row) => stringValue(row.role));
    const roleScore = symbolRoles.some((role) => ["domain-contract", "request-dto", "response-dto", "view-model", "entity", "options"].includes(role)) ? 2 : 0;
    return (membersBySymbol.get(symbolId) ?? []).map((member) => {
      const name = stringValue(member.member_name);
      const memberWords = identifierWords(name).map((word) => word.toLowerCase());
      const lowerName = name.toLowerCase();
      const queryMatch = [...queryTermSet].some((term) => lowerName.includes(term) || memberWords.includes(term));
      return {
        owner,
        name,
        typeName: stringValue(member.type_name) || undefined,
        required: booleanValue(member.required),
        nullable: booleanValue(member.nullable),
        score: Number(queryMatch) * 5 + roleScore
      };
    });
  });

  return rows
    .filter((row) => row.name)
    .sort((left, right) => right.score - left.score || left.owner.localeCompare(right.owner) || left.name.localeCompare(right.name))
    .slice(0, 8)
    .map(({ score: _score, ...row }) => row);
}

function groupRows(rows: Array<Record<string, unknown>>, key: (row: Record<string, unknown>) => string): Map<string, Array<Record<string, unknown>>> {
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const groupKey = key(row);
    if (!groupKey) {
      continue;
    }
    const group = grouped.get(groupKey) ?? [];
    group.push(row);
    grouped.set(groupKey, group);
  }
  return grouped;
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
