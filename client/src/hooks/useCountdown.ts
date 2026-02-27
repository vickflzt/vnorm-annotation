import { useCallback, useEffect, useRef, useState } from "react";

interface UseCountdownOptions {
  durationSeconds: number;
  onExpire: () => void;
  active: boolean;
}

/**
 * Countdown hook that:
 * - Counts down from durationSeconds to 0, firing onExpire once at 0.
 * - After expiry the timer CONTINUES counting upward (elapsed > durationSeconds),
 *   so callers can detect how much overtime has accumulated.
 * - `remaining` goes to 0 and stays there; `elapsedSeconds` keeps growing.
 */
export function useCountdown({ durationSeconds, onExpire, active }: UseCountdownOptions) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const expiredRef = useRef(false);

  const reset = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startTimeRef.current = null;
    expiredRef.current = false;
    setRemaining(durationSeconds);
    setElapsedSeconds(0);
  }, [durationSeconds]);

  useEffect(() => {
    if (!active) return;
    expiredRef.current = false;
    startTimeRef.current = Date.now();

    const tick = () => {
      if (!startTimeRef.current) return;
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const left = Math.max(0, durationSeconds - elapsed);

      setRemaining(left);
      setElapsedSeconds(elapsed);

      // Fire onExpire exactly once when countdown hits 0
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }

      // Keep ticking even after expiry so overtime is tracked
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, durationSeconds, onExpire]);

  return { remaining, elapsedSeconds, reset };
}
