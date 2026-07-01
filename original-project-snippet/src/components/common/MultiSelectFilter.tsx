import {
  Checkbox,
  Chip,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  Stack,
} from "@mui/material";
import type { LatencyFilterOption } from "../../types/latency";

type MultiSelectFilterProps<T extends string> = {
  label: string;
  value: T[];
  options: LatencyFilterOption<T>[];
  onChange: (nextValue: T[]) => void;
  disabled?: boolean;
};

export function MultiSelectFilter<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: MultiSelectFilterProps<T>) {
  const optionLabelById = new Map(
    options.map((option) => [option.id, option.label]),
  );

  return (
    <FormControl fullWidth size="medium" disabled={disabled}>
      <InputLabel>{label}</InputLabel>

      <Select
        multiple
        value={value}
        label={label}
        input={<OutlinedInput label={label} />}
        renderValue={(selected) => {
          const selectedIds = selected as T[];

          return (
            <Stack direction="row" gap={0.75} flexWrap="wrap">
              {selectedIds.map((id) => (
                <Chip
                  key={id}
                  size="small"
                  label={optionLabelById.get(id) ?? id}
                />
              ))}
            </Stack>
          );
        }}
        onChange={(event) => {
          const selectedValue = event.target.value;

          onChange(
            typeof selectedValue === "string"
              ? (selectedValue.split(",") as T[])
              : (selectedValue as T[]),
          );
        }}
      >
        {options.map((option) => (
          <MenuItem key={option.id} value={option.id}>
            <Checkbox checked={value.includes(option.id)} />
            <ListItemText primary={option.label} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
