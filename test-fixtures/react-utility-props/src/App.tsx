import { MetricPanel, SlotPanel, TokenPanel } from "./UtilityPanels";

export function App() {
  return (
    <>
      <TokenPanel primary="Launch" data-tone="calm" />
      <SlotPanel header="Header" footer="Footer" highlighted="header" />
      <MetricPanel label="Metrics" data-tone="warm" data-size="large" />
    </>
  );
}
