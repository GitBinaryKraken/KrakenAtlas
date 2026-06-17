#!/usr/bin/env node

if (typeof globalThis.File === "undefined") {
  globalThis.File = require("buffer").File;
}

const path = require("path");
const fs = require("fs");
const outIndex = process.argv.findIndex((arg) => arg === "--out" || arg === "-o");
if (outIndex >= 0 && process.argv[outIndex + 1]) {
  fs.mkdirSync(path.dirname(path.resolve(process.argv[outIndex + 1])), { recursive: true });
}

require("@vscode/vsce/out/main")(process.argv);
