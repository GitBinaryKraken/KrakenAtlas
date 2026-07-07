import { ReactDeclaration } from "./reactAnalyzerTypes";
import { slug } from "./reactTypeText";

export function reactModuleId(filePath: string): string {
  return `symbol:react:${filePath}`;
}

export function reactDeclarationId(filePath: string, kind: ReactDeclaration["kind"], name: string): string {
  return `symbol:react:${filePath}:${kind}:${slug(name)}`;
}

export function routeTargetId(route: string): string {
  return `route:web:${route.replace(/:[A-Za-z_$][\w$-]*/gu, ":param")}`;
}
