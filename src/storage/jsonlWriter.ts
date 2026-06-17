import * as fs from "fs/promises";
import * as path from "path";

export async function writeJsonl<T>(filePath: string, records: T[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const content = records.map((record) => JSON.stringify(record)).join("\n");
  await fs.writeFile(filePath, content.length > 0 ? `${content}\n` : "", "utf8");
}
