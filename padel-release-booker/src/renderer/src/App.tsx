import type { JSX } from 'react';
import { useState } from 'react';
import { useAppState } from './useAppState.js';
import { Dashboard } from './pages/Dashboard.js';
import { ConnectionPage } from './pages/Connection.js';
import { RuleWizardPage } from './pages/RuleWizard.js';
import { BookingHistoryPage } from './pages/BookingHistory.js';

type Page = 'dashboard' | 'connection' | 'rules' | 'history';

export function App(): JSX.Element {
  const [page, setPage] = useState<Page>('dashboard');
  const { state, heartbeat, notices, refresh } = useAppState();

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="brand">
          Padel Release Booker
          <small>Local-first · {state ? modeLabel(state.mode) : '…'}</small>
        </div>
        <button className={navClass(page, 'dashboard')} onClick={() => setPage('dashboard')}>
          Dashboard
        </button>
        <button className={navClass(page, 'connection')} onClick={() => setPage('connection')}>
          Connection
        </button>
        <button className={navClass(page, 'rules')} onClick={() => setPage('rules')}>
          Setup Wizard &amp; Rules
        </button>
        <button className={navClass(page, 'history')} onClick={() => setPage('history')}>
          Booking History
        </button>
        <div className="sidebar-footer">
          <div className="muted" style={{ fontSize: 11 }}>
            {state?.emergencyStopped ? '🛑 Emergency stop engaged' : '✅ Scheduler active'}
          </div>
        </div>
      </nav>
      <main className="main">
        {page === 'dashboard' && <Dashboard state={state} heartbeat={heartbeat} notices={notices} onRefresh={refresh} />}
        {page === 'connection' && <ConnectionPage state={state} onRefresh={refresh} />}
        {page === 'rules' && <RuleWizardPage state={state} onRefresh={refresh} />}
        {page === 'history' && <BookingHistoryPage />}
      </main>
    </div>
  );
}

function navClass(current: Page, target: Page): string {
  return `nav-item${current === target ? ' active' : ''}`;
}

function modeLabel(mode: string): string {
  if (mode === 'mock') return 'Mock sandbox';
  if (mode === 'assisted') return 'Assisted (real)';
  return mode;
}
