export function splitTopLevelGenericArgs(value: string): string[] {
  const args: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "<") {
      depth += 1;
    } else if (char === ">") {
      depth = Math.max(0, depth - 1);
    } else if (char === "," && depth === 0) {
      args.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  args.push(value.slice(start).trim());
  return args.filter(Boolean);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function simpleTypeName(value: string | undefined): string | undefined {
  return value?.trim().match(/^([A-Za-z_$][\w$]*)\b/u)?.[1];
}

export function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:/-]+/g, "_");
}
