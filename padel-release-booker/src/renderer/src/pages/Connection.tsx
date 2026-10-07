import type { JSX } from 'react';
import { useState } from 'react';
import type { AppStateSummary } from '../../../shared/ipc.js';

interface Props {
  state: AppStateSummary | null;
  onRefresh: () => void | Promise<void>;
}

export function ConnectionPage({ state, onRefresh }: Props): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function connect(mode: 'mock' | 'assisted'): Promise<void> {
    setBusy(true);
    try {
      await window.padelApi.connect({ mode });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(): Promise<void> {
    setBusy(true);
    try {
      await window.padelApi.disconnect();
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteAllData(): Promise<void> {
    setBusy(true);
    try {
      await window.padelApi.deleteAllLocalData();
      await onRefresh();
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Connection</h1>
      <p className="page-subtitle">
        Choose how this app talks to Playtomic. There is no mode that logs in and books on your behalf without you
        watching — see the Integration Feasibility Report for exactly why.
      </p>

      <div className="grid-2">
        <div className="card">
          <h3>Mock sandbox</h3>
          <p className="muted">
            Fully offline, deterministic, fictional club &amp; booking data. Use this to learn the app, build and test
            rules, and rehearse the arming/authorization flow with zero risk. Mock bookings are never real — they are
            clearly labeled everywhere, including Booking History.
          </p>
          <button className="btn secondary" disabled={busy} onClick={() => void connect('mock')}>
            Connect (Mock)
          </button>
        </div>

        <div className="card">
          <h3>Assisted (real Playtomic)</h3>
          <p className="muted">
            Opens the real, allowlisted Playtomic club page in your normal browser at the right moment, and sends you a
            notification. You log in, search, pick the slot, and pay yourself — exactly like booking without this app,
            just reminded at the right second. This app never sees or stores your Playtomic password.
          </p>
          <button className="btn secondary" disabled={busy} onClick={() => void connect('assisted')}>
            Set up assisted mode
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Current session</h3>
        {state ? (
          <div className="stack">
            <div>
              Mode: <strong>{state.mode}</strong>
            </div>
            <div>
              State: <strong>{state.session.state}</strong>
            </div>
            {state.session.accountLabel && <div>Account: {state.session.accountLabel}</div>}
            {state.session.lastError && <div className="callout bad">{state.session.lastError}</div>}
            <div className="row">
              <button className="btn secondary" disabled={busy} onClick={() => void disconnect()}>
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <span className="muted">Loading…</span>
        )}
      </div>

      <div className="card">
        <h3>Delete local data</h3>
        <p className="muted">
          Permanently deletes every rule, occurrence, booking record, and stored session secret on this Mac. This cannot
          be undone and does not cancel anything already booked on Playtomic itself.
        </p>
        {!confirmDelete ? (
          <button className="btn danger" onClick={() => setConfirmDelete(true)}>
            Delete all local data…
          </button>
        ) : (
          <div className="row">
            <span className="muted">Are you sure? This cannot be undone.</span>
            <button className="btn danger" disabled={busy} onClick={() => void deleteAllData()}>
              Yes, delete everything
            </button>
            <button className="btn secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
