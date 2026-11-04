// @vitest-environment jsdom
/**
 * UI smoke test for the rule lifecycle: create -> preview -> create & review
 * -> arm, plus pause/resume. `window.padelApi` is mocked here so this test
 * never touches a real database, adapter, or network — it only verifies the
 * renderer wires user actions to the correct IPC calls and renders their
 * results, per spec section 9 ("Add UI tests for creating, reviewing,
 * arming, pausing, and inspecting a rule.").
 */
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RuleWizardPage } from '../../src/renderer/src/pages/RuleWizard.js';
import type { AppStateSummary } from '../../src/shared/ipc.js';
import { buildFictionalRule, FICTIONAL_CLUB } from '../helpers/fixtures.js';

function makeState(overrides: Partial<AppStateSummary> = {}): AppStateSummary {
  return {
    mode: 'mock',
    session: { mode: 'mock', state: 'connected', accountLabel: 'mock-player@example.invalid', connectedAtUtc: null, expiresAtUtc: null, lastError: null },
    clubs: [FICTIONAL_CLUB],
    rules: [],
    recentBookings: [],
    emergencyStopped: false,
    schedulerRunning: true,
    lastHeartbeatWallMs: Date.now(),
    platformWarnings: [],
    ...overrides
  };
}

function installMockApi() {
  const rule = buildFictionalRule({ id: 'rule-1' });
  const api = {
    getAppState: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    resolveClubByUrl: vi.fn(),
    confirmClub: vi.fn(),
    searchClubs: vi.fn(),
    listCourts: vi.fn(),
    createRule: vi.fn().mockResolvedValue({ rule, occurrences: [], warnings: [] }),
    updateRule: vi.fn(),
    deleteRule: vi.fn().mockResolvedValue(undefined),
    previewOccurrences: vi.fn().mockResolvedValue([
      { playDate: '2026-11-10', playStartUtc: '2026-11-10T18:00:00.000Z', playEndUtc: '2026-11-10T19:30:00.000Z', releaseAtUtc: '2026-11-03T07:00:00.000Z', warnings: [] }
    ]),
    buildAuthorizationReview: vi.fn().mockResolvedValue({
      mode: 'mock',
      accountLabel: 'mock-player@example.invalid',
      club: { id: FICTIONAL_CLUB.id, name: FICTIONAL_CLUB.name, location: FICTIONAL_CLUB.location, timezone: FICTIONAL_CLUB.timezone, verified: true },
      playDate: rule.playDate,
      preferredStartTime: rule.preferredStartTime,
      durationMinutes: rule.durationMinutes,
      preferredCourtIds: rule.preferredCourtIds,
      fallbackOptions: rule.fallbackOptions,
      exactTimeOnly: rule.exactTimeOnly,
      release: rule.release,
      maxTotalPrice: rule.maxTotalPrice,
      currency: rule.currency,
      maxSuccessfulBookingsPerOccurrence: rule.maxSuccessfulBookingsPerOccurrence,
      maxFutureActiveBookings: rule.maxFutureActiveBookings,
      allowedPaymentMethodLabel: 'Mock payment method (sandbox)',
      cancellationPolicy: { available: true, summary: 'Sandbox: free cancellation anytime.', nonRefundableFeesSummary: null },
      authorizationExpiresAtUtc: null,
      _hash: 'hash-abc'
    }),
    armRule: vi.fn().mockResolvedValue({ id: 'auth-1', ruleId: 'rule-1', version: 1, createdAtUtc: '', expiresAtUtc: null, summaryJson: '{}', coveredFieldsHash: 'hash-abc', revokedAtUtc: null }),
    pauseRule: vi.fn().mockResolvedValue(undefined),
    resumeRule: vi.fn().mockResolvedValue(undefined),
    emergencyStop: vi.fn(),
    emergencyResume: vi.fn(),
    listOccurrences: vi.fn().mockResolvedValue([]),
    listBookingHistory: vi.fn().mockResolvedValue([]),
    reportUserOutcome: vi.fn(),
    exportDiagnostics: vi.fn(),
    deleteAllLocalData: vi.fn(),
    openClubPage: vi.fn(),
    onHeartbeat: vi.fn().mockReturnValue(() => {}),
    onNotice: vi.fn().mockReturnValue(() => {})
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.padelApi = api;
  return { api, rule };
}

describe('RuleWizardPage — create, review, arm, pause/resume, inspect', () => {
  it('walks through club selection, rule creation, review, and arming', async () => {
    const user = userEvent.setup();
    const { api } = installMockApi();
    const onRefresh = vi.fn();
    const state = makeState();

    render(<RuleWizardPage state={state} onRefresh={onRefresh} />);

    // Step 1: pick the existing confirmed club.
    await user.click(await screen.findByRole('button', { name: FICTIONAL_CLUB.name }));

    // Step 2: rule form appears, pre-filled with sane defaults; preview occurrences.
    expect(await screen.findByText(/Club:/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Preview upcoming occurrences/i }));
    await waitFor(() => expect(api.previewOccurrences).toHaveBeenCalled());
    expect(await screen.findByText('2026-11-10')).toBeInTheDocument();

    // Create the rule, which should fetch the authorization review for step 3.
    await user.click(screen.getByRole('button', { name: /Create rule & continue to review/i }));
    await waitFor(() => expect(api.createRule).toHaveBeenCalled());
    await waitFor(() => expect(api.buildAuthorizationReview).toHaveBeenCalledWith('rule-1'));

    // Step 3: review screen shows the material terms, then arm.
    expect(await screen.findByText(/Authorization review/i)).toBeInTheDocument();
    expect(screen.getByText(/Mock payment method/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Arm the rule/i }));
    await waitFor(() => expect(api.armRule).toHaveBeenCalledWith({ ruleId: 'rule-1', reviewedSummaryHash: 'hash-abc' }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('lists existing rules and supports pause/resume/delete (inspecting a rule)', async () => {
    const user = userEvent.setup();
    const { api, rule } = installMockApi();
    const onRefresh = vi.fn();
    const state = makeState({ rules: [{ ...rule, isPaused: false }] });

    render(<RuleWizardPage state={state} onRefresh={onRefresh} />);

    expect(screen.getByText(rule.name)).toBeInTheDocument();
    const row = screen.getByText(rule.name).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(api.pauseRule).toHaveBeenCalledWith(rule.id));

    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.deleteRule).toHaveBeenCalledWith(rule.id));
  });

  it('shows the paused state and a Resume action for a paused rule', () => {
    const { rule } = installMockApi();
    const state = makeState({ rules: [{ ...rule, isPaused: true }] });
    render(<RuleWizardPage state={state} onRefresh={vi.fn()} />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });
});
