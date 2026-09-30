import { useEffect, useState } from 'react';

/** Abort obsolete requests and never display a response under another filter's labels. */
export function usePageHistoryQuery<T>(key: string, fetcher: (signal: AbortSignal) => Promise<T>, enabled = true) {
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetcher(controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : 'Could not load analytics.' });
    });
    return () => controller.abort();
  }, [key, fetcher, enabled]);
  const current = enabled && result?.key === key ? result : undefined;
  return { data: current?.data, error: current?.error, loading: enabled && !current };
}
