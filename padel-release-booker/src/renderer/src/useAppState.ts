import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppStateSummary, HeartbeatEvent, NoticeEvent } from '../../shared/ipc.js';

export interface NoticeLogEntry extends NoticeEvent {
  id: number;
  atMs: number;
}

export function useAppState(pollIntervalMs = 4000) {
  const [state, setState] = useState<AppStateSummary | null>(null);
  const [heartbeat, setHeartbeat] = useState<HeartbeatEvent | null>(null);
  const [notices, setNotices] = useState<NoticeLogEntry[]>([]);
  const noticeId = useRef(0);

  const refresh = useCallback(async () => {
    const next = await window.padelApi.getAppState();
    setState(next);
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), pollIntervalMs);
    const offHeartbeat = window.padelApi.onHeartbeat((event) => setHeartbeat(event));
    const offNotice = window.padelApi.onNotice((event) => {
      noticeId.current += 1;
      setNotices((prev) => [{ ...event, id: noticeId.current, atMs: Date.now() }, ...prev].slice(0, 50));
      void refresh();
    });
    return () => {
      clearInterval(interval);
      offHeartbeat();
      offNotice();
    };
  }, [refresh, pollIntervalMs]);

  return { state, heartbeat, notices, refresh };
}
