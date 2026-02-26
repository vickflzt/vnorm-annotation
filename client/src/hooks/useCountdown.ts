import { useCallback, useEffect, useRef, useState } from "react";

interface UseCountdownOptions {
  durationSeconds: number;
  onExpire: () => void;
  active: boolean;
}

export function useCountdown({ durationSeconds, onExpire, active }: UseCountdownOptions) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const expiredRef = useRef(false);

  const reset = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startTimeRef.current = null;
    expiredRef.current = false;
    setRemaining(durationSeconds);
  }, [durationSeconds]);

  useEffect(() => {
    if (!active) return;
    expiredRef.current = false;
    startTimeRef.current = Date.now();

    const tick = () => {
      if (!startTimeRef.current || expiredRef.current) return;
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const left = Math.max(0, durationSeconds - elapsed);
      setRemaining(left);

      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, durationSeconds, onExpire]);

  const elapsedSeconds = durationSeconds - remaining;

  return { remaining, elapsedSeconds, reset };
}
