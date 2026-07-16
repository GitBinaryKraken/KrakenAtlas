#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const packagePath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");
const projectPath = path.join(root, "cartographer", "KrakenAtlas.Cartographer", "KrakenAtlas.Cartographer.csproj");
const analyzerVersionsPath = path.join(root, "cartographer", "KrakenAtlas.Core", "AtlasAnalyzerVersions.cs");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const manifest = readJson(packagePath);
const current = manifest.version;
const requested = process.argv[2];

if (!requested) {
  console.error("Usage: npm run release:bump -- <patch|minor|major|x.y.z>");
  process.exit(1);
}

const parts = current.split(".").map(Number);
const next = /^\d+\.\d+\.\d+$/.test(requested)
  ? requested
  : requested === "patch"
    ? `${parts[0]}.${parts[1]}.${parts[2] + 1}`
    : requested === "minor"
      ? `${parts[0]}.${parts[1] + 1}.0`
      : requested === "major"
        ? `${parts[0] + 1}.0.0`
        : null;

if (!next) {
  console.error(`Unsupported version target: ${requested}`);
  process.exit(1);
}

manifest.version = next;
writeJson(packagePath, manifest);

const lock = readJson(lockPath);
lock.version = next;
if (lock.packages?.[""]) {
  lock.packages[""].version = next;
}
writeJson(lockPath, lock);

const project = fs.readFileSync(projectPath, "utf8").replace(/<Version>[^<]+<\/Version>/, `<Version>${next}</Version>`);
fs.writeFileSync(projectPath, project, "utf8");

const analyzerVersions = fs.readFileSync(analyzerVersionsPath, "utf8")
  .replace(/public const string ReleaseVersion = "[^"]+";/, `public const string ReleaseVersion = "${next}";`);
fs.writeFileSync(analyzerVersionsPath, analyzerVersions, "utf8");

for (const relativePath of ["README.md", "GETTING_STARTED.md"]) {
  const file = path.join(root, relativePath);
  const content = fs.readFileSync(file, "utf8").split(current).join(next);
  fs.writeFileSync(file, content, "utf8");
}

console.log(`Bumped Kraken Atlas from ${current} to ${next}.`);
