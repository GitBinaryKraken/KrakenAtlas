import * as fs from "fs/promises";

export async function readJsonl<T>(filePath: string): Promise<T[]> {
  if (!(await pathExists(filePath))) {
    return [];
  }

  const content = await fs.readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
