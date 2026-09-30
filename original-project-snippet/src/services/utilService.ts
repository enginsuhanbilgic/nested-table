export const numberFormatter = new Intl.NumberFormat("en-US");

export const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function getDefaultFromDate() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return date.toISOString().slice(0, 10);
}

export function getDefaultToDate() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDateLabel(date: string) {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${day}.${month}`;
}

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function isBeforeToday(dateKey: string): boolean {
  return dateKey < getLocalDateKey();
}

export function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}
