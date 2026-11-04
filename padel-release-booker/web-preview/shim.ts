/**
 * Browser shim that implements window.padelApi over HTTP + SSE against the
 * web-preview server. Loaded before the React app so useAppState works
 * without Electron's preload bridge.
 */
import type { PadelApi, HeartbeatEvent, NoticeEvent } from '../src/shared/ipc.js';

async function invoke<T>(method: string, args?: unknown): Promise<T> {
  const response = await fetch(`/api/invoke/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: args === undefined ? '{}' : JSON.stringify(args)
  });
  const payload = (await response.json()) as { ok: boolean; result?: T; error?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? `API call failed: ${method}`);
  }
  return payload.result as T;
}

function subscribe(eventName: 'heartbeat' | 'notice', listener: (data: unknown) => void): () => void {
  const source = new EventSource('/api/events');
  const handler = (event: MessageEvent) => {
    try {
      listener(JSON.parse(String(event.data)));
    } catch {
      /* ignore malformed */
    }
  };
  source.addEventListener(eventName, handler as EventListener);
  source.onerror = () => {
    /* browser will reconnect; keep quiet */
  };
  return () => {
    source.removeEventListener(eventName, handler as EventListener);
    source.close();
  };
}

const api: PadelApi = {
  getAppState: () => invoke('getAppState'),
  connect: (request) => invoke('connect', request),
  disconnect: () => invoke('disconnect'),
  resolveClubByUrl: (url) => invoke('resolveClubByUrl', { url }),
  confirmClub: (club) => invoke('confirmClub', club),
  searchClubs: (query) => invoke('searchClubs', query),
  listCourts: (clubId) => invoke('listCourts', clubId),
  createRule: (input) => invoke('createRule', input),
  updateRule: (ruleId, input) => invoke('updateRule', { ruleId, input }),
  deleteRule: (ruleId) => invoke('deleteRule', ruleId),
  previewOccurrences: (input, count) => invoke('previewOccurrences', { input, count }),
  buildAuthorizationReview: (ruleId) => invoke('buildAuthorizationReview', ruleId),
  armRule: (request) => invoke('armRule', request),
  pauseRule: (ruleId) => invoke('pauseRule', ruleId),
  resumeRule: (ruleId) => invoke('resumeRule', ruleId),
  emergencyStop: () => invoke('emergencyStop'),
  emergencyResume: () => invoke('emergencyResume'),
  listOccurrences: (ruleId) => invoke('listOccurrences', ruleId),
  listBookingHistory: (limit) => invoke('listBookingHistory', limit),
  reportUserOutcome: (request) => invoke('reportUserOutcome', request),
  exportDiagnostics: async () => {
    const json = await invoke<string>('exportDiagnostics');
    const blob = new Blob([json], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `padel-release-booker-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(href);
    return 'Downloaded in this browser (web preview — not written to macOS Downloads).';
  },
  deleteAllLocalData: () => invoke('deleteAllLocalData'),
  openClubPage: async (url) => {
    await invoke('openClubPage', url);
    window.open(url, '_blank', 'noopener,noreferrer');
  },
  onHeartbeat: (listener) => subscribe('heartbeat', (data) => listener(data as HeartbeatEvent)),
  onNotice: (listener) => subscribe('notice', (data) => listener(data as NoticeEvent))
};

(window as Window & { padelApi: PadelApi }).padelApi = api;
