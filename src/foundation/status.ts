export interface FoundationStatus {
  phase: string;
  cartographerState: string;
  atlasState: string;
  indexingState: string;
  message: string;
}

export function renderFoundationStatus(status: FoundationStatus, extensionVersion: string): string {
  return [
    `Kraken Atlas ${extensionVersion}`,
    `Phase: ${status.phase}`,
    `Cartographer: ${status.cartographerState}`,
    `Atlas: ${status.atlasState}`,
    `Indexing: ${status.indexingState}`,
    "",
    status.message
  ].join("\n");
}
