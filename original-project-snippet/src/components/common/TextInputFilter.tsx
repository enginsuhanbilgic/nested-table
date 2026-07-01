import {
  FormControl,
  InputLabel,
  OutlinedInput,
} from "@mui/material";
import { useId } from "react";

type TextInputFilterProps = {
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function TextInputFilter({
  label,
  value,
  onChange,
  disabled = false,
  placeholder,
}: TextInputFilterProps) {
  const inputId = useId();

  return (
    <FormControl
      fullWidth
      size="medium"
      disabled={disabled}
    >
      <InputLabel htmlFor={inputId}>{label}</InputLabel>
      <OutlinedInput
        id={inputId}
        label={label}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </FormControl>
  );
}
