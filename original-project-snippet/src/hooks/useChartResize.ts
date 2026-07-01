import { useEffect, useRef, useCallback } from "react";
import { SIDEBAR_TRANSITION_MS } from "../components/layout/Sidebar";

function easeInOut(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function useChartResize(collapsed: boolean) {
  const chartRefs = useRef<any[]>([]);
  const rafRef = useRef<number | null>(null);
  const isFirstRender = useRef(true);

  const registerChart = useCallback((ref: any) => {
    if (ref && !chartRefs.current.includes(ref)) {
      chartRefs.current.push(ref);
    }
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      const startTime = performance.now();
      let lastEased = -1;

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / SIDEBAR_TRANSITION_MS, 1);
        const eased = easeInOut(t);

        if (Math.abs(eased - lastEased) > 0.008 || t >= 1) {
          lastEased = eased;
          chartRefs.current.forEach((ref) => {
            ref?.getEchartsInstance?.().resize();
          });
        }

        if (t < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          rafRef.current = null;
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    });

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [collapsed]);

  return { registerChart };
}
