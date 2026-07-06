#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const packageJson = readJson("package.json");
const version = packageJson.version;
const versionedVsix = `${packageJson.name}-${version}.vsix`;
const errors = [];

checkLockfile();
checkRequiredVersion("src/cli.ts", [
  `kraken-atlas ${version}`,
  `Kraken Atlas ${version}`
]);
checkRequiredVersion("src/extension.ts", [`?? "${version}"`]);
checkRequiredVersion("src/agent/terminalInstructions.ts", [`defaultSkillVersion = "${version}"`]);
checkRequiredVersion("README.md", [
  `What's New In ${version}`,
  `Version \`${version}\``,
  versionedVsix
]);
checkReadmeReleaseNotes();
checkRequiredVersion("GETTING_STARTED.md", [versionedVsix]);
checkPublicDocsDoNotNamePrivateFixtures();
checkNoHardcodedVsixScript();

if (errors.length > 0) {
  console.error("Release version check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Release version check passed for ${packageJson.name} ${version}.`);

function readFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readFile(relativePath));
}

function checkLockfile() {
  const lock = readJson("package-lock.json");
  if (lock.version !== version) {
    errors.push(`package-lock.json version is ${lock.version}, expected ${version}.`);
  }
  const rootVersion = lock.packages?.[""]?.version;
  if (rootVersion !== version) {
    errors.push(`package-lock.json packages[\"\"].version is ${rootVersion}, expected ${version}.`);
  }
}

function checkRequiredVersion(relativePath, expectedSnippets) {
  const content = readFile(relativePath);
  for (const snippet of expectedSnippets) {
    if (!content.includes(snippet)) {
      errors.push(`${relativePath} is missing ${JSON.stringify(snippet)}.`);
    }
  }
}

function checkReadmeReleaseNotes() {
  const content = readFile("README.md");
  const headings = [...content.matchAll(/^## What's New In \d+\.\d+\.\d+$/gm)];
  const currentHeading = `## What's New In ${version}`;
  const currentIndex = content.indexOf(currentHeading);
  const historyIndex = content.indexOf("## Release History");

  if (headings.length > 1 && historyIndex < 0) {
    errors.push("README.md has multiple release-note sections but is missing ## Release History.");
  }
  if (historyIndex >= 0 && currentIndex > historyIndex) {
    errors.push(`README.md current release notes for ${version} are under Release History.`);
  }
}

function checkPublicDocsDoNotNamePrivateFixtures() {
  const publicFiles = [
    "AGENT_SKILL.md",
    "ALPHA_FEEDBACK.md",
    "CHANGELOG.md",
    "GETTING_STARTED.md",
    "NEXT_STEPS.md",
    "README.md",
    "RELEASE_PROCESS.md",
    "docs/packaged-release-history-audit.md",
    "src/agent/terminalInstructions.ts"
  ];

  for (const relativePath of publicFiles) {
    const filePath = path.join(projectRoot, relativePath);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    const privateFixturePattern = new RegExp(`\\b${["ke", "lp"].join("")}\\b`, "i");
    if (privateFixturePattern.test(content)) {
      errors.push(`${relativePath} contains private fixture wording.`);
    }
  }
}

function checkNoHardcodedVsixScript() {
  const scripts = packageJson.scripts ?? {};
  const versionedVsixPattern = /kraken-atlas-\d+\.\d+\.\d+\.vsix/;
  for (const [name, command] of Object.entries(scripts)) {
    if (versionedVsixPattern.test(command)) {
      errors.push(`package.json script ${name} hardcodes a VSIX artifact path.`);
    }
  }
}
