import * as path from "path";

const generatedNamePatterns = [
  /\.g\.cs$/i,
  /\.generated\.cs$/i,
  /\.designer\.cs$/i,
  /\.min\.js$/i,
  /\.min\.css$/i
];

export function isGeneratedFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return generatedNamePatterns.some((pattern) => pattern.test(fileName));
}
