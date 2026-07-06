export type TokenPanelProps = Record<string, string> & {
  primary: string;
};

export interface SlotPanelProps {
  [slot: string]: string | undefined;
  highlighted?: string;
}

export type MetricPanelProps = Record<`data-${"tone" | "size"}`, string> & {
  label: string;
};

export function TokenPanel(props: TokenPanelProps) {
  return <section data-tone={props["data-tone"]}>{props.primary}</section>;
}

export function SlotPanel(props: SlotPanelProps) {
  return <section data-highlighted={props.highlighted}>{props.header}</section>;
}

export function MetricPanel(props: MetricPanelProps) {
  return <section data-tone={props["data-tone"]}>{props.label}: {props["data-size"]}</section>;
}
