import type { ImportedPickerOptionList } from "./PickerTypes";

export type PickerValue = "ready" | "blocked";

export type PickerOptionList<TValue extends PickerValue = PickerValue> = TValue[];

export interface GenericPickerProps<TValue extends PickerValue = PickerValue> {
  value: TValue;
  options: PickerOptionList<TValue>;
  onChange?: (value: TValue) => void;
}

export function GenericPicker<TValue extends PickerValue = PickerValue>({
  value,
  options,
  onChange
}: GenericPickerProps<TValue>) {
  return (
    <label>
      <select value={value} onChange={() => onChange?.(value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface AliasPickerProps<TOption extends PickerValue = PickerValue> {
  selected: TOption;
  choices: ImportedPickerOptionList<TOption>;
  onSelect?: (choice: TOption) => void;
}

export function AliasPicker<TItem extends PickerValue = PickerValue>({
  selected,
  choices,
  onSelect
}: AliasPickerProps<TItem>) {
  return (
    <label>
      <select value={selected} onChange={() => onSelect?.(selected)}>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface DefaultedPickerProps<TChoice extends PickerValue = PickerValue> {
  current: TChoice;
  entries: ImportedPickerOptionList<TChoice>;
  onPick?: (choice: TChoice) => void;
}

export function DefaultedPicker<TSelection extends PickerValue = PickerValue>({
  current,
  entries,
  onPick
}: DefaultedPickerProps<TSelection>) {
  return (
    <label>
      <select value={current} onChange={() => onPick?.(current)}>
        {entries.map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      </select>
    </label>
  );
}
