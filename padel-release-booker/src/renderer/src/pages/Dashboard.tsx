import type { JSX } from 'react';
import { useMemo } from 'react';
import type { AppStateSummary, HeartbeatEvent } from '../../../shared/ipc.js';
import type { NoticeLogEntry } from '../useAppState.js';

interface Props {
  state: AppStateSummary | null;
  heartbeat: HeartbeatEvent | null;
  notices: NoticeLogEntry[];
  onRefresh: () => void | Promise<void>;
}

function statusBadge(session: AppStateSummary['session']): JSX.Element {
  const map: Record<string, { cls: string; label: string }> = {
    connected: { cls: 'ok', label: 'Connected' },
    connecting: { cls: 'info', label: 'Connecting…' },
    disconnected: { cls: 'neutral', label: 'Disconnected' },
    expired: { cls: 'warn', label: 'Session expired' },
    error: { cls: 'bad', label: 'Error' }
  };
  const entry = map[session.state] ?? map.disconnected!;
  return (
    <span className={`badge ${entry.cls}`}>
      <span className="badge-dot" />
      {entry.label}
    </span>
  );
}

export function Dashboard({ state, heartbeat, notices, onRefresh }: Props): JSX.Element {
  const heartbeatAgeSeconds = heartbeat ? Math.round((Date.now() - heartbeat.nowWallMs) / 1000) : null;

  const nextOccurrences = useMemo(() => {
    if (!state) return [];
    // Dashboard summary only; the Setup Wizard & Rules page shows full detail per rule.
    return state.rules.filter((r) => !r.isPaused);
  }, [state]);

  async function handleEmergencyStop(): Promise<void> {
    await window.padelApi.emergencyStop();
    await onRefresh();
  }

  async function handleResume(): Promise<void> {
    await window.padelApi.emergencyResume();
    await onRefresh();
  }

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">
        Live status of your Playtomic connection, scheduler, and armed rules. This app can prepare ahead of a release and
        notify/act at the right moment — it cannot guarantee it wins a race against other players, and it cannot act while
        your Mac is asleep or the app is quit.
      </p>

      <div className="grid-3">
        <div className="card">
          <h3>Connection</h3>
          {state ? (
            <div className="stack">
              {statusBadge(state.session)}
              <div className="muted">Mode: {state.mode === 'mock' ? 'Mock sandbox (never real)' : state.mode === 'assisted' ? 'Assisted (opens the real site)' : state.mode}</div>
              {state.session.accountLabel && <div className="muted">Account: {state.session.accountLabel}</div>}
            </div>
          ) : (
            <span className="muted">Loading…</span>
          )}
        </div>

        <div className="card">
          <h3>Live booking supported?</h3>
          <div className="callout warn" style={{ margin: 0 }}>
            <strong>No.</strong> No fully automatic live adapter exists (see Integration Feasibility Report). Automatic mode
            only works in the Mock sandbox. Real bookings use Assisted mode: this app opens the real page for you to finish.
          </div>
        </div>

        <div className="card">
          <h3>Scheduler health</h3>
          <div className="stack">
            <span className={`badge ${heartbeatAgeSeconds !== null && heartbeatAgeSeconds < 30 ? 'ok' : 'warn'}`}>
              <span className="badge-dot" />
              {heartbeatAgeSeconds !== null ? `Last heartbeat ${heartbeatAgeSeconds}s ago` : 'No heartbeat yet'}
            </span>
            <span className="muted">Active occurrences this tick: {heartbeat?.activeOccurrenceCount ?? '—'}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <h3 style={{ margin: 0 }}>Global control</h3>
        </div>
        <p className="muted" style={{ marginTop: 4 }}>
          Emergency stop immediately prevents any new automatic preflight, availability check, or booking attempt across
          every rule. It does not cancel bookings already confirmed, and it does not reconcile attempts already in flight —
          those still resolve safely (never a blind retry) and simply show up in Booking History.
        </p>
        <div className="row">
          {state?.emergencyStopped ? (
            <button className="btn" onClick={() => void handleResume()}>
              Resume scheduling
            </button>
          ) : (
            <button className="btn danger" onClick={() => void handleEmergencyStop()}>
              Emergency stop
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Armed &amp; active rules</h3>
        {nextOccurrences.length === 0 && <p className="muted">No active rules. Go to Setup Wizard &amp; Rules to create one.</p>}
        {nextOccurrences.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Mode</th>
                <th>Price cap</th>
              </tr>
            </thead>
            <tbody>
              {nextOccurrences.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.mode}</td>
                  <td>
                    {r.maxTotalPrice} {r.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Recent notices</h3>
        {notices.length === 0 && <p className="muted">Nothing yet.</p>}
        <div className="stack">
          {notices.slice(0, 10).map((n) => (
            <div key={n.id} className={`callout ${n.level === 'error' ? 'bad' : n.level === 'warning' ? 'warn' : 'info'}`}>
              <strong>{n.title}</strong>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {n.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
