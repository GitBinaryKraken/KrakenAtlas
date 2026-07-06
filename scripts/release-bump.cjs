#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const packagePath = path.join(projectRoot, "package.json");
const lockPath = path.join(projectRoot, "package-lock.json");
const packageJson = readJson(packagePath);
const currentVersion = packageJson.version;
const requestedVersion = process.argv[2];

if (!requestedVersion || requestedVersion === "--help" || requestedVersion === "-h") {
  usage();
  process.exit(requestedVersion ? 0 : 1);
}

const nextVersion = resolveNextVersion(currentVersion, requestedVersion);
if (compareVersions(nextVersion, currentVersion) <= 0) {
  fail(`Target version ${nextVersion} must be greater than current version ${currentVersion}.`);
}

updatePackageMetadata(nextVersion);
replaceVersionReferences(nextVersion);
rollChangelog(nextVersion);
syncReadmeReleaseNotes(nextVersion);

console.log(`Bumped Kraken Atlas from ${currentVersion} to ${nextVersion}.`);
console.log("Next: review generated README and CHANGELOG release notes, then run npm run release:check-version.");

function usage() {
  console.log("Usage: npm run release:bump -- <version|patch|minor|major>");
  console.log("Examples:");
  console.log("  npm run release:bump -- 0.1.31");
  console.log("  npm run release:bump -- patch");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveNextVersion(current, requested) {
  if (/^\d+\.\d+\.\d+$/.test(requested)) {
    return requested;
  }

  const [major, minor, patch] = parseVersion(current);
  if (requested === "patch") {
    return `${major}.${minor}.${patch + 1}`;
  }
  if (requested === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  if (requested === "major") {
    return `${major + 1}.0.0`;
  }

  fail(`Unsupported version target: ${requested}`);
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    fail(`Unsupported package version: ${version}`);
  }
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

function updatePackageMetadata(nextVersion) {
  packageJson.version = nextVersion;
  writeJson(packagePath, packageJson);

  const lock = readJson(lockPath);
  lock.version = nextVersion;
  if (lock.packages?.[""]) {
    lock.packages[""].version = nextVersion;
  }
  writeJson(lockPath, lock);
}

function replaceVersionReferences(nextVersion) {
  replaceAll("src/cli.ts", currentVersion, nextVersion);
  replaceAll("src/extension.ts", currentVersion, nextVersion);
  replaceAll("src/agent/terminalInstructions.ts", currentVersion, nextVersion);

  replaceAll("README.md", `kraken-atlas-${currentVersion}.vsix`, `kraken-atlas-${nextVersion}.vsix`);
  replaceAll("GETTING_STARTED.md", `kraken-atlas-${currentVersion}.vsix`, `kraken-atlas-${nextVersion}.vsix`);
  replaceAll("GETTING_STARTED.md", `kraken-atlas-${currentVersion}.tgz`, `kraken-atlas-${nextVersion}.tgz`);

  replaceAll("RELEASE_PROCESS.md", `npm version ${currentVersion} --no-git-tag-version`, `npm run release:bump -- ${nextVersion}`);
  replaceAll("RELEASE_PROCESS.md", `kraken-atlas-${currentVersion}.vsix`, `kraken-atlas-${nextVersion}.vsix`);
}

function rollChangelog(nextVersion) {
  const changelogPath = path.join(projectRoot, "CHANGELOG.md");
  const content = fs.readFileSync(changelogPath, "utf8");
  if (content.includes(`## ${nextVersion}`)) {
    return;
  }

  const match = /^## Unreleased\s*([\s\S]*?)(?=^##\s+\d+\.\d+\.\d+)/m.exec(content);
  if (!match || match[1].trim().length === 0) {
    return;
  }

  const unreleasedBlock = match[1].trim();
  const replacement = `## Unreleased\n\n## ${nextVersion}\n\n${unreleasedBlock}\n\n`;
  fs.writeFileSync(changelogPath, content.replace(/^## Unreleased\s*[\s\S]*?(?=^##\s+\d+\.\d+\.\d+)/m, replacement), "utf8");
}

function syncReadmeReleaseNotes(nextVersion) {
  const readmePath = path.join(projectRoot, "README.md");
  let readme = fs.readFileSync(readmePath, "utf8");
  const newHeading = `## What's New In ${nextVersion}`;
  if (readme.includes(newHeading)) {
    return;
  }

  const changelogNotes = changelogSection(nextVersion);
  if (!changelogNotes) {
    return;
  }

  const testCount = inferTestCount(changelogNotes);
  const validationSentence = testCount
    ? `It has ${testCount} automated tests.`
    : "Review this generated summary after running the release validation.";
  const releaseBlock = `${newHeading}\n\n${changelogNotes}\n\nVersion \`${nextVersion}\` is a public alpha intended for real-project feedback. ${validationSentence}\n\n`;
  const firstReleaseHeading = /\n## What's New In \d+\.\d+\.\d+/m.exec(readme);

  readme = readme.replace(/\n## Release History\n\s*/g, "\n");
  if (firstReleaseHeading) {
    const insertAt = firstReleaseHeading.index + 1;
    readme = `${readme.slice(0, insertAt)}${releaseBlock}## Release History\n\n${readme.slice(insertAt)}`;
  } else {
    const firstDivider = readme.indexOf("\n---\n");
    if (firstDivider >= 0) {
      readme = `${readme.slice(0, firstDivider)}\n${releaseBlock}${readme.slice(firstDivider)}`;
    }
  }

  fs.writeFileSync(readmePath, readme, "utf8");
}

function changelogSection(version) {
  const changelogPath = path.join(projectRoot, "CHANGELOG.md");
  const changelog = fs.readFileSync(changelogPath, "utf8");
  const escapedVersion = version.replace(/\./g, "\\.");
  const pattern = new RegExp(`^## ${escapedVersion}\\s*([\\s\\S]*?)(?=^##\\s+\\d+\\.\\d+\\.\\d+|(?![\\s\\S]))`, "m");
  const match = pattern.exec(changelog);
  return match?.[1]?.trim() ?? "";
}

function inferTestCount(notes) {
  const match = /(\d+)\s+passing tests|(\d+)\s+automated tests/i.exec(notes);
  return match?.[1] ?? match?.[2] ?? "";
}

function replaceAll(relativePath, find, replace) {
  const filePath = path.join(projectRoot, relativePath);
  const content = fs.readFileSync(filePath, "utf8");
  if (!content.includes(find)) {
    return;
  }
  fs.writeFileSync(filePath, content.split(find).join(replace), "utf8");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
