import { uniqueStrings } from "./queryUtils";

export function domainFlowTerms(terms: string[]): string[] {
  const generic = new Set([
    "image",
    "images",
    "render",
    "rendering",
    "edit",
    "editing",
    "editable",
    "make",
    "code",
    "data",
    "view",
    "views",
    "model",
    "models"
  ]);
  const domainTerms = terms.filter((term) => term.length >= 4 && !generic.has(term));
  return domainTerms.length ? domainTerms.slice(0, 5) : terms.filter((term) => term.length >= 4).slice(0, 3);
}

export function queryCoreTerms(query: string): string[] {
  const stopWords = new Set(["add", "new", "the", "for", "and", "with", "field", "property", "feature", "change", "update", "keep", "when", "while", "truthful"]);
  if (queryWantsBrowserQueryState(query.toLowerCase())) {
    stopWords.add("string");
  }
  return uniqueStrings(query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !stopWords.has(term)));
}

export function queryTerms(query: string): string[] {
  const terms = queryCoreTerms(query);
  return uniqueStrings(terms.flatMap((term) => [term, ...termVariants(term)]));
}

export function termVariants(term: string): string[] {
  if (term.length > 4 && term.endsWith("ies")) {
    return [`${term.slice(0, -3)}y`];
  }
  if (term.length > 4 && term.length <= 10 && term.endsWith("s") && !term.endsWith("ss")) {
    return [term.slice(0, -1)];
  }

  return [];
}

export function conceptMatchesText(concept: string, text: string): boolean {
  if (text.includes(concept)) {
    return true;
  }
  return termVariants(concept).some((variant) => text.includes(variant));
}

export function queryVariants(query: string): string[] {
  const terms = queryTerms(query);
  if (terms.length <= 1) {
    return [query].filter(Boolean);
  }

  const dashed = terms.join("-");
  const compact = terms.join("");
  const pascal = terms.map((term) => `${term.slice(0, 1).toUpperCase()}${term.slice(1)}`).join("");
  return uniqueStrings([query, dashed, compact, pascal]);
}

export function queryWantsIdentityAccountFlow(lowerQuery: string): boolean {
  return /\b(user|account|identity|register|registration|login|external|profile|persona|create|creation|initial|setup|sign)\b/i.test(lowerQuery);
}

export function queryWantsIdentityUserShape(lowerQuery: string): boolean {
  const mentionsUser = /\b(user|account|identity|aspnetusers|asp net users)\b/i.test(lowerQuery);
  const mentionsShapeChange = /\b(new|add|adding|added|create|field|fields|property|properties|prop|column|columns|variable|variables|parameter|parameters|aspect|attribute|attributes)\b/i.test(lowerQuery);
  const mentionsEndpointFlow = /\b(endpoint|route|controller|api|handler|request|command|form|view|ui|button|page)\b/i.test(lowerQuery);
  return mentionsUser && mentionsShapeChange && !mentionsEndpointFlow;
}

export function queryWantsBrowserQueryState(lowerQuery: string): boolean {
  return /\b(query string|query-string|location search|browser history|url search params|urlsearchparams)\b/i.test(lowerQuery);
}

export function queryWantsJavaScriptInteraction(lowerQuery: string): boolean {
  return /\b(click|highlight|dom|browser|javascript|client-side|event|selection|selected)\b/u.test(lowerQuery)
    && /\b(map|result|controller|button|element|search|selection|selected)\b/u.test(lowerQuery);
}

export function queryWantsBrowserQueryWrite(lowerQuery: string): boolean {
  return queryWantsBrowserQueryState(lowerQuery) && /\b(write|writes|writing|change|changes|update|updates|sync|store|persist|push|replace|add|set)\b/i.test(lowerQuery);
}

export function queryWantsCompositionRoot(lowerQuery: string): boolean {
  if (/\b(startup|program|middleware|pipeline|route|routing|endpoint|config|configuration|setting|settings|option|options|hosted|worker)\b/i.test(lowerQuery)) {
    return true;
  }

  const mentionsRegistration = /\b(register|registered|registering|registration)\b/i.test(lowerQuery);
  const mentionsComposition = /\b(di|dependency|dependencies|inject|injection|service|services|container|composition)\b/i.test(lowerQuery);
  return mentionsRegistration && mentionsComposition;
}

export function queryWantsValidationOrAuth(lowerQuery: string): boolean {
  return /\b(valid|validate|validation|validator|rule|rules|auth|authorize|authorization|policy|permission|required)\b/i.test(lowerQuery);
}

export function queryWantsFormOrProfile(lowerQuery: string): boolean {
  return /\b(form|forms|field|fields|input|inputs|view|views|ui|profile|persona|setup|registration|register|account)\b/i.test(lowerQuery);
}
