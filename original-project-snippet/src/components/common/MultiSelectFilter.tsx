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
import type { SxProps, Theme } from "@mui/material/styles";
import type { LatencyFilterOption } from "../../types/latency";

type MultiSelectFilterProps<T extends string> = {
  label: string;
  value: T[];
  options: LatencyFilterOption<T>[];
  onChange: (nextValue: T[]) => void;
  disabled?: boolean;
  size?: "small" | "medium";
  // Render the selection as one-line text ("All", or the selected labels
  // comma-joined) instead of chips — keeps the control one line tall in
  // dense bars.
  compact?: boolean;
  // Styles the root FormControl; use it to size the filter per page.
  sx?: SxProps<Theme>;
};

export function MultiSelectFilter<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  size = "medium",
  compact = false,
  sx,
}: MultiSelectFilterProps<T>) {
  const optionLabelById = new Map(
    options.map((option) => [option.id, option.label]),
  );

  return (
    <FormControl fullWidth size={size} disabled={disabled} sx={sx}>
      <InputLabel>{label}</InputLabel>

      <Select
        multiple
        value={value}
        label={label}
        input={<OutlinedInput label={label} />}
        renderValue={(selected) => {
          const selectedIds = selected as T[];

          if (compact) {
            if (
              options.length > 0 &&
              selectedIds.length === options.length
            ) {
              return "All";
            }
            // The Select display box ellipsizes overflow, so long
            // selections truncate instead of growing the control.
            return selectedIds
              .map((id) => optionLabelById.get(id) ?? id)
              .join(", ");
          }

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
