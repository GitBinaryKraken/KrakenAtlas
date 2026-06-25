export const defaultOutputFolder = ".kraken-atlas";

export const defaultIgnoredDirectories = new Set([
  ".git",
  ".vs",
  ".vscode",
  ".agents",
  ".kraken-atlas",
  "node_modules",
  "bin",
  "obj",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  "artifacts",
  "graphify-out",
  "cached-pages",
  "sandbox",
  "sandbox_old"
]);

export const defaultIgnoredFileNames = new Set([
  ".kraken-atlas-ignore",
  "AGENTS.md",
  "graph.html",
  "graph.json",
  "graph_tree.html",
  "graph_report.md"
]);

export const defaultIgnoredExtensions = new Set([
  ".map"
]);

export const defaultIgnoredGlobs = [
  ".tmp*",
  "**/Properties/PublishProfiles/**",
  "**/*.min.js",
  "**/*.generated.*",
  "**/*.designer.cs",
  "**/*.g.cs"
];

export const defaultIgnoreFileName = ".kraken-atlas-ignore";

export const defaultSensitiveFileNames = new Set([
  ".env",
  "secrets.json",
  "id_rsa",
  "id_dsa"
]);

export const defaultSensitiveExtensions = new Set([
  ".pem",
  ".key",
  ".pfx",
  ".p12"
]);

export const defaultMaxFileSizeBytes = 1_048_576;
