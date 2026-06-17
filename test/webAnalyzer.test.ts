import * as assert from "assert";
import * as path from "path";
import test from "node:test";
import { analyzeVanillaWeb } from "../src/analyzers/webAnalyzer";
import { scanWorkspaceFiles } from "../src/scanner/fileScanner";

test("analyzeVanillaWeb emits symbols and relationships for HTML/Razor and vanilla JS", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.join(projectRoot, "test-fixtures", "vanilla-web-simple");
  const files = await scanWorkspaceFiles(fixtureRoot, { outputFolder: ".kraken-atlas" });
  const result = await analyzeVanillaWeb(fixtureRoot, files);

  assert.ok(result.symbols.some((symbol) => symbol.kind === "view" && symbol.file === "Views/User/Edit.cshtml"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "form" && symbol.name === "user-edit-form"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "input" && symbol.name === "user-name"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "function" && symbol.name === "saveUserForm"));
  assert.ok(result.symbols.some((symbol) => symbol.kind === "eventHandler" && symbol.name === "save-user:click"));

  assert.ok(
    result.references.some(
      (reference) =>
        reference.context === "script-src" &&
        reference.resolvedSymbolId === "symbol:javascript:wwwroot/js/user-form.js"
    )
  );

  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "LOADS_SCRIPT" &&
        relationship.from === "symbol:razor:Views/User/Edit.cshtml" &&
        relationship.to === "symbol:javascript:wwwroot/js/user-form.js"
    )
  );
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "POSTS_TO" &&
        relationship.from === "symbol:razor:Views/User/Edit.cshtml:form:user-edit-form" &&
        relationship.to === "route:web:User.Save"
    )
  );
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "SELECTS_ELEMENT" &&
        relationship.to === "symbol:razor:Views/User/Edit.cshtml:input:user-name"
    )
  );
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "HANDLES_EVENT" &&
        relationship.from === "symbol:javascript:wwwroot/js/user-form.js:event:save-user:click" &&
        relationship.to === "symbol:razor:Views/User/Edit.cshtml:button:save-user"
    )
  );
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "CALLS" &&
        relationship.from === "symbol:javascript:wwwroot/js/user-form.js" &&
        relationship.to === "route:web:/api/users"
    )
  );
});

test("analyzeVanillaWeb maps Razor Page forms to page-handler routes", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.join(projectRoot, "test-fixtures", "dotnet-feature-flow");
  const files = await scanWorkspaceFiles(fixtureRoot, { outputFolder: ".kraken-atlas" });
  const result = await analyzeVanillaWeb(fixtureRoot, files);

  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "POSTS_TO" &&
        relationship.from === "symbol:razor:Pages/Badges.cshtml:form:badge-form" &&
        relationship.to === "route:razor-page-handler:Badges.SaveLocationBadge"
    )
  );
});
