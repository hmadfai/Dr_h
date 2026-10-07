import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { BookingRecord } from '../../../core/domain/types.js';

const OUTCOME_BADGE: Record<BookingRecord['outcome'], string> = {
  CONFIRMED: 'ok',
  FAILED: 'bad',
  EXPIRED: 'neutral',
  AWAITING_USER_ACTION: 'warn',
  UNKNOWN: 'warn'
};

export function BookingHistoryPage(): JSX.Element {
  const [records, setRecords] = useState<BookingRecord[] | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);

  useEffect(() => {
    void window.padelApi.listBookingHistory(200).then(setRecords);
  }, []);

  async function exportDiagnostics(): Promise<void> {
    const path = await window.padelApi.exportDiagnostics();
    setExportPath(path);
  }

  return (
    <div>
      <h1 className="page-title">Booking History</h1>
      <p className="page-subtitle">
        Every outcome this app has recorded, across all modes. Mock-mode rows are clearly a sandbox result, never a real
        Playtomic booking. "Unknown outcome" rows mean a submission timed out and could not be confirmed either way — the
        app never silently retries those; they wait for reconciliation or your manual review.
      </p>

      <div className="card">
        <div className="row between">
          <h3 style={{ margin: 0 }}>Diagnostic export</h3>
          <button className="btn secondary" onClick={() => void exportDiagnostics()}>
            Export redacted diagnostics
          </button>
        </div>
        {exportPath && <p className="muted">Saved to: {exportPath}</p>}
      </div>

      <div className="card">
        {!records && <p className="muted">Loading…</p>}
        {records && records.length === 0 && <p className="muted">No booking attempts recorded yet.</p>}
        {records && records.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Mode</th>
                <th>Outcome</th>
                <th>Court</th>
                <th>Play time</th>
                <th>Price</th>
                <th>Reference</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{new Date(r.createdAtUtc).toLocaleString()}</td>
                  <td>
                    <span className="tag">{r.mode}</span>
                  </td>
                  <td>
                    <span className={`badge ${OUTCOME_BADGE[r.outcome]}`}>
                      <span className="badge-dot" />
                      {r.outcome}
                    </span>
                  </td>
                  <td>{r.courtName ?? '—'}</td>
                  <td>{r.startUtc ? new Date(r.startUtc).toLocaleString() : '—'}</td>
                  <td>{r.price !== null ? `${r.price} ${r.currency}` : '—'}</td>
                  <td className="mono">{r.bookingReference ?? '—'}</td>
                  <td className="muted">{r.failureReason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
