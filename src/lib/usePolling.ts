"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";
import { config } from "./config";
import { errorMessage } from "./useAsync";

/** После стольких ошибок подряд опрос останавливается и специалист повторяет его вручную. */
export const MAX_POLL_FAILURES = 5;

export interface PollingState {
  /** Ошибок подряд; 0 — связь в порядке. */
  failures: number;
  /** Причина последней ошибки. */
  lastError: string | null;
  /** Опрос остановлен после MAX_POLL_FAILURES ошибок или из-за отказа в доступе. */
  stopped: boolean;
  /** Возобновить опрос после остановки. */
  retry: () => void;
}

/**
 * Опрос сервера, пока идёт фоновая обработка. Ошибки не глотаются молча: счётчик и причина видны
 * специалисту, интервал растёт, после нескольких неудач опрос останавливается до ручного повтора.
 * 401/403 опрос сразу прекращают — повторять бессмысленно, вход восстанавливает AuthProvider.
 */
export function usePolling<T>(active: boolean, load: () => Promise<T>, onData: (data: T) => void): PollingState {
  const [failures, setFailures] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [round, setRound] = useState(0);
  const loadRef = useRef(load);
  const onDataRef = useRef(onData);
  loadRef.current = load;
  onDataRef.current = onData;

  useEffect(() => {
    if (!active || stopped) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failed = 0;

    const tick = () => {
      loadRef.current().then(
        (data) => {
          if (cancelled) return;
          failed = 0;
          setFailures(0);
          setLastError(null);
          onDataRef.current(data);
          timer = setTimeout(tick, config.pollInterval);
        },
        (e) => {
          if (cancelled) return;
          failed++;
          setFailures(failed);
          setLastError(errorMessage(e));
          const denied = e instanceof ApiError && (e.status === 401 || e.status === 403);
          if (denied || failed >= MAX_POLL_FAILURES) {
            setStopped(true);
            return;
          }
          timer = setTimeout(tick, config.pollInterval * Math.min(failed + 1, 4));
        },
      );
    };
    timer = setTimeout(tick, config.pollInterval);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, stopped, round]);

  const retry = useCallback(() => {
    setFailures(0);
    setLastError(null);
    setStopped(false);
    setRound((r) => r + 1);
  }, []);

  return { failures, lastError, stopped, retry };
}
