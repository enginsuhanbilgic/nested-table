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
}: {
  onDebouncedChange: (v: string) => void;
}) {
  const [queryInput, setQueryInput] = useState("");
  const debouncedQuery = useDebouncedValue(queryInput, 500);

  useEffect(() => {
    onDebouncedChange(debouncedQuery);
  }, [debouncedQuery]);

  return (
    <TextInputFilter
      label="Search"
      value={queryInput}
      onChange={setQueryInput}
    />
  );
}
