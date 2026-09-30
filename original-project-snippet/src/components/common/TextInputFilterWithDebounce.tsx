import { useState, useEffect } from "react";
import { TextInputFilter } from "./TextInputFilter";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

export function TextInputFilterWithDebounce({
  onDebouncedChange,
  label = "Search",
  placeholder,
  disabled = false,
  initialValue = "",
  type,
  size,
}: {
  onDebouncedChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  initialValue?: string;
  type?: string;
  size?: "small" | "medium";
}) {
  const [queryInput, setQueryInput] = useState(initialValue);
  const debouncedQuery = useDebouncedValue(queryInput, 500);

  useEffect(() => {
    onDebouncedChange(debouncedQuery);
  }, [debouncedQuery]);

  return (
    <TextInputFilter
      label={label}
      value={queryInput}
      onChange={setQueryInput}
      placeholder={placeholder}
      disabled={disabled}
      type={type}
      size={size}
    />
  );
}
