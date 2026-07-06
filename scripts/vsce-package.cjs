#!/usr/bin/env node

if (typeof globalThis.File === "undefined") {
  globalThis.File = require("buffer").File;
}

const path = require("path");
const fs = require("fs");

const packageJsonPath = path.resolve(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const outIndex = process.argv.findIndex((arg) => arg === "--out" || arg === "-o");

if (outIndex < 0) {
  const artifactName = `${packageJson.name}-${packageJson.version}.vsix`;
  const artifactPath = path.resolve(__dirname, "..", "..", "pack-artifacts", artifactName);
  process.argv.push("--out", artifactPath);
}

const effectiveOutIndex = process.argv.findIndex((arg) => arg === "--out" || arg === "-o");
if (effectiveOutIndex >= 0 && process.argv[effectiveOutIndex + 1]) {
  fs.mkdirSync(path.dirname(path.resolve(process.argv[effectiveOutIndex + 1])), { recursive: true });
}

require("@vscode/vsce/out/main")(process.argv);
