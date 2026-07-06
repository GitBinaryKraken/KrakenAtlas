import { AliasPicker, DefaultedPicker, GenericPicker } from "./GenericPicker";
import type { PickerValue } from "./GenericPicker";

export function App() {
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
    </>
  );
}
