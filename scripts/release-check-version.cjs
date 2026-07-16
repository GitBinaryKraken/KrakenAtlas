#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const manifest = readJson("package.json");
const lock = readJson("package-lock.json");
const project = fs.readFileSync(path.join(root, "cartographer", "KrakenAtlas.Cartographer", "KrakenAtlas.Cartographer.csproj"), "utf8");
const analyzerVersions = fs.readFileSync(path.join(root, "cartographer", "KrakenAtlas.Core", "AtlasAnalyzerVersions.cs"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const errors = [];

if (manifest.name !== "kraken-atlas" || manifest.publisher !== "BinaryKraken") {
  errors.push("Published extension identity changed.");
}
if (lock.version !== manifest.version || lock.packages?.[""]?.version !== manifest.version) {
  errors.push("package-lock.json version does not match package.json.");
}
if (!project.includes(`<Version>${manifest.version}</Version>`)) {
  errors.push("Cartographer project version does not match package.json.");
}
if (!analyzerVersions.includes(`ReleaseVersion = "${manifest.version}"`)) {
  errors.push("Analyzer release version does not match package.json.");
}
if (!readme.includes(`Version \`${manifest.version}\``)) {
  errors.push("README does not name the current version.");
}

if (errors.length) {
  console.error("Release version check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Release version check passed for Kraken Atlas ${manifest.version}.`);
