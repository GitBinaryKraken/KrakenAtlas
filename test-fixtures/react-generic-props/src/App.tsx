import { AliasPicker, DefaultedPicker, GenericPicker } from "./GenericPicker";
import type { PickerValue } from "./GenericPicker";

export function App() {
  const defaultCurrent: PickerValue = "ready";
  const defaultEntries: PickerValue[] = ["ready", "blocked"];

  return (
    <>
      <GenericPicker<PickerValue>
        value="ready"
        options={["ready", "blocked"]}
        onChange={() => undefined}
      />
      <AliasPicker<PickerValue>
        selected="blocked"
        choices={["ready", "blocked"]}
        onSelect={() => undefined}
      />
      <DefaultedPicker
        current="ready"
        entries={["ready", "blocked"]}
        onPick={() => undefined}
      />
      <DefaultedPicker
        current={defaultCurrent}
        entries={defaultEntries}
      />
    </>
  );
}
