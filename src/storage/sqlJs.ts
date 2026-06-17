import { createRequire } from "module";
import initSqlJs, { SqlJsStatic } from "sql.js";

let sqlJsPromise: Promise<SqlJsStatic> | undefined;
const requireFromHere = createRequire(__filename);

export function loadSqlJs(): Promise<SqlJsStatic> {
  sqlJsPromise ??= initSqlJs({
    locateFile: (fileName) => requireFromHere.resolve(`sql.js/dist/${fileName}`)
  });

  return sqlJsPromise;
}
