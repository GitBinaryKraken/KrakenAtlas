export function placeholders(count: number): string {
  return new Array(Math.max(count, 1)).fill("?").join(", ");
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function numberValue(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

export function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "number" ? value !== 0 : undefined;
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

export function mergeSearchRows(...groups: Array<Array<Record<string, unknown>>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  return groups.flat().filter((row) => {
    const id = stringValue(row.record_id);
    if (!id || seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

export function uniqueById(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = stringValue(row.id) || JSON.stringify(row);
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}
