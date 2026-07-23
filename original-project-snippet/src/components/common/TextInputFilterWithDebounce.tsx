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
}: {
  onDebouncedChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [queryInput, setQueryInput] = useState("");
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
    />
  );
}
