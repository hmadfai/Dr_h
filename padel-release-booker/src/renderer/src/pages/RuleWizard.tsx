import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import type { AppStateSummary } from '../../../shared/ipc.js';
import type { Club, Weekday } from '../../../core/domain/types.js';
import type { BookingRuleInput } from '../../../core/domain/validation.js';
import type { OccurrencePlanEntry } from '../../../core/time/releaseSchedule.js';
import type { AuthorizationReviewSummary } from '../../../core/domain/authorization.js';

interface Props {
  state: AppStateSummary | null;
  onRefresh: () => void | Promise<void>;
}

const WEEKDAYS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function defaultDraft(clubId: string, mode: AppStateSummary['mode']): BookingRuleInput {
  return {
    name: 'New booking rule',
    clubId,
    playDate: { kind: 'recurring', weekdays: ['TUE'], endDate: null, occurrenceLimit: null },
    preferredStartTime: '19:00',
    durationMinutes: 90,
    preferredCourtIds: 'any',
    surfacePreference: 'no-preference',
    exactTimeOnly: true,
    fallbackOptions: [],
    maxTotalPrice: 30,
    currency: 'EUR',
    maxSuccessfulBookingsPerOccurrence: 1,
    maxFutureActiveBookings: 4,
    exclusionDates: [],
    release: { kind: 'days-before-at-local-time', daysBefore: 7, localTime: '08:00', verified: false },
    preflightMinutesBeforeRelease: 5,
    pollingWindowSeconds: 90,
    pollingIntervalSeconds: 3,
    ambiguousLocalTimePolicy: 'latest',
    nonexistentLocalTimePolicy: 'push-forward',
    mode: mode === 'assisted' ? 'assisted' : 'mock'
  };
}

export function RuleWizardPage({ state, onRefresh }: Props): JSX.Element {
  const [step, setStep] = useState<'club' | 'rule' | 'review'>('club');
  const [clubUrlInput, setClubUrlInput] = useState('');
  const [resolvedClub, setResolvedClub] = useState<Club | null>(null);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BookingRuleInput | null>(null);
  const [preview, setPreview] = useState<OccurrencePlanEntry[]>([]);
  const [createdRuleId, setCreatedRuleId] = useState<string | null>(null);
  const [review, setReview] = useState<(AuthorizationReviewSummary & { _hash: string }) | null>(null);
  const [confirmClubName, setConfirmClubName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeClub = useMemo(() => state?.clubs.find((c) => c.id === selectedClubId) ?? null, [state, selectedClubId]);

  async function handleResolveUrl(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const club = await window.padelApi.resolveClubByUrl(clubUrlInput);
      setResolvedClub(club);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmResolvedClub(finalClub: Club): Promise<void> {
    await window.padelApi.confirmClub(finalClub);
    await onRefresh();
    setSelectedClubId(finalClub.id);
    setDraft(defaultDraft(finalClub.id, state?.mode ?? 'mock'));
    setStep('rule');
  }

  function useExistingClub(club: Club): void {
    setSelectedClubId(club.id);
    setDraft(defaultDraft(club.id, state?.mode ?? 'mock'));
    setStep('rule');
  }

  async function handlePreview(): Promise<void> {
    if (!draft) return;
    setError(null);
    setBusy(true);
    try {
      const plan = await window.padelApi.previewOccurrences(draft, 6);
      setPreview(plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateRule(): Promise<void> {
    if (!draft) return;
    setError(null);
    setBusy(true);
    try {
      const { rule } = await window.padelApi.createRule(draft);
      setCreatedRuleId(rule.id);
      const r = await window.padelApi.buildAuthorizationReview(rule.id);
      setReview(r);
      setStep('review');
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleArm(): Promise<void> {
    if (!createdRuleId || !review) return;
    setError(null);
    setBusy(true);
    try {
      await window.padelApi.armRule({ ruleId: createdRuleId, reviewedSummaryHash: review._hash });
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(patch: Partial<BookingRuleInput>): void {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  return (
    <div>
      <h1 className="page-title">Setup Wizard &amp; Rules</h1>
      <p className="page-subtitle">
        Configure the club, play date, release timing, price cap, and authorization for one booking rule. Nothing here is
        hardcoded — every field is entered by you.
      </p>

      {error && <div className="callout bad">{error}</div>}

      <div className="card">
        <h3>Your existing rules</h3>
        {state && state.rules.length === 0 && <p className="muted">No rules yet. Use the wizard below to create one.</p>}
        {state && state.rules.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Mode</th>
                <th>Price cap</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.mode}</td>
                  <td>
                    {r.maxTotalPrice} {r.currency}
                  </td>
                  <td>{r.isPaused ? <span className="badge neutral"><span className="badge-dot" />Paused</span> : <span className="badge ok"><span className="badge-dot" />Active</span>}</td>
                  <td className="row">
                    {r.isPaused ? (
                      <button className="btn secondary" onClick={() => void window.padelApi.resumeRule(r.id).then(onRefresh)}>
                        Resume
                      </button>
                    ) : (
                      <button className="btn secondary" onClick={() => void window.padelApi.pauseRule(r.id).then(onRefresh)}>
                        Pause
                      </button>
                    )}
                    <button className="btn danger" onClick={() => void window.padelApi.deleteRule(r.id).then(onRefresh)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="row wrap" style={{ marginBottom: 12 }}>
          <span className={`badge ${step === 'club' ? 'info' : 'neutral'}`}>1. Club</span>
          <span className={`badge ${step === 'rule' ? 'info' : 'neutral'}`}>2. Rule &amp; release</span>
          <span className={`badge ${step === 'review' ? 'info' : 'neutral'}`}>3. Review &amp; arm</span>
        </div>

        {step === 'club' && (
          <div className="stack">
            <h3>Pick an existing confirmed club</h3>
            <div className="row wrap">
              {state?.clubs.map((c) => (
                <button key={c.id} className="btn secondary" onClick={() => useExistingClub(c)}>
                  {c.name}
                </button>
              ))}
            </div>

            <h3 style={{ marginTop: 18 }}>Or resolve a new club by URL</h3>
            <p className="muted">
              Paste the exact Playtomic club page URL. {state?.mode === 'mock' ? 'In Mock mode, this looks up fictional sandbox clubs.' : 'In Assisted mode, you must confirm the name/location/timezone yourself after visiting the page — there is no automatic verification without a supported API.'}
            </p>
            <label className="field">
              Club URL
              <input value={clubUrlInput} onChange={(e) => setClubUrlInput(e.target.value)} placeholder="https://playtomic.com/clubs/your-club" />
            </label>
            <div className="row">
              <button className="btn" disabled={busy || !clubUrlInput} onClick={() => void handleResolveUrl()}>
                Resolve
              </button>
            </div>

            {resolvedClub && (
              <div className="callout warn stack">
                <strong>Confirm this is the exact venue you mean — similarly named clubs exist.</strong>
                <label className="field">
                  Name
                  <input defaultValue={resolvedClub.name} onChange={(e) => setResolvedClub({ ...resolvedClub, name: e.target.value })} />
                </label>
                <label className="field">
                  Location
                  <input defaultValue={resolvedClub.location} onChange={(e) => setResolvedClub({ ...resolvedClub, location: e.target.value })} />
                </label>
                <label className="field">
                  IANA timezone (e.g. Europe/Madrid)
                  <input defaultValue={resolvedClub.timezone} onChange={(e) => setResolvedClub({ ...resolvedClub, timezone: e.target.value })} />
                </label>
                <label className="field">
                  Type the club name to confirm
                  <input value={confirmClubName} onChange={(e) => setConfirmClubName(e.target.value)} />
                </label>
                <button
                  className="btn"
                  disabled={confirmClubName.trim() !== resolvedClub.name.trim() || !resolvedClub.name}
                  onClick={() => void handleConfirmResolvedClub(resolvedClub)}
                >
                  Confirm this club
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'rule' && draft && (
          <div className="stack">
            <div className="callout info">Club: {activeClub?.name ?? draft.clubId} ({activeClub?.timezone})</div>

            <label className="field">
              Rule name
              <input value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} />
            </label>

            <div className="grid-2">
              <label className="field">
                Play pattern
                <select
                  value={draft.playDate.kind}
                  onChange={(e) =>
                    updateDraft({
                      playDate:
                        e.target.value === 'one-off'
                          ? { kind: 'one-off', date: new Date().toISOString().slice(0, 10) }
                          : { kind: 'recurring', weekdays: ['TUE'], endDate: null, occurrenceLimit: null }
                    })
                  }
                >
                  <option value="recurring">Recurring weekday(s)</option>
                  <option value="one-off">One-off date</option>
                </select>
              </label>

              {draft.playDate.kind === 'one-off' ? (
                <label className="field">
                  Date
                  <input
                    type="date"
                    value={draft.playDate.date}
                    onChange={(e) => updateDraft({ playDate: { kind: 'one-off', date: e.target.value } })}
                  />
                </label>
              ) : (
                <label className="field">
                  Weekdays
                  <div className="row wrap">
                    {WEEKDAYS.map((wd) => {
                      const active = draft.playDate.kind === 'recurring' && draft.playDate.weekdays.includes(wd);
                      return (
                        <button
                          key={wd}
                          type="button"
                          className={`btn secondary${active ? '' : ''}`}
                          style={{ padding: '4px 8px', background: active ? 'rgba(79,209,165,0.18)' : undefined }}
                          onClick={() => {
                            if (draft.playDate.kind !== 'recurring') return;
                            const set = new Set(draft.playDate.weekdays);
                            if (set.has(wd)) set.delete(wd);
                            else set.add(wd);
                            updateDraft({ playDate: { ...draft.playDate, weekdays: [...set] } });
                          }}
                        >
                          {wd}
                        </button>
                      );
                    })}
                  </div>
                </label>
              )}
            </div>

            <div className="grid-3">
              <label className="field">
                Preferred start time (club-local)
                <input type="time" value={draft.preferredStartTime} onChange={(e) => updateDraft({ preferredStartTime: e.target.value })} />
              </label>
              <label className="field">
                Duration (minutes)
                <input type="number" value={draft.durationMinutes} onChange={(e) => updateDraft({ durationMinutes: Number(e.target.value) })} />
              </label>
              <label className="field">
                Surface preference
                <select value={draft.surfacePreference} onChange={(e) => updateDraft({ surfacePreference: e.target.value as BookingRuleInput['surfacePreference'] })}>
                  <option value="no-preference">No preference</option>
                  <option value="indoor">Indoor</option>
                  <option value="outdoor">Outdoor</option>
                </select>
              </label>
            </div>

            <label className="field">
              Preferred courts (comma-separated court IDs, or leave blank for "any eligible court")
              <input
                value={draft.preferredCourtIds === 'any' ? '' : draft.preferredCourtIds.join(', ')}
                onChange={(e) => {
                  const text = e.target.value.trim();
                  updateDraft({ preferredCourtIds: text === '' ? 'any' : text.split(',').map((s) => s.trim()).filter(Boolean) });
                }}
              />
            </label>

            <label className="row">
              <input type="checkbox" checked={draft.exactTimeOnly} onChange={(e) => updateDraft({ exactTimeOnly: e.target.checked })} />
              Exact-time-only (default) — ignore fallback times/courts below
            </label>

            <div className="grid-3">
              <label className="field">
                Max total price
                <input type="number" value={draft.maxTotalPrice} onChange={(e) => updateDraft({ maxTotalPrice: Number(e.target.value) })} />
              </label>
              <label className="field">
                Currency
                <input value={draft.currency} onChange={(e) => updateDraft({ currency: e.target.value.toUpperCase() })} maxLength={3} />
              </label>
              <label className="field">
                Max successful bookings per occurrence
                <input
                  type="number"
                  value={draft.maxSuccessfulBookingsPerOccurrence}
                  onChange={(e) => updateDraft({ maxSuccessfulBookingsPerOccurrence: Number(e.target.value) })}
                />
              </label>
            </div>

            <div className="grid-3">
              <label className="field">
                Max future active bookings for this rule
                <input type="number" value={draft.maxFutureActiveBookings} onChange={(e) => updateDraft({ maxFutureActiveBookings: Number(e.target.value) })} />
              </label>
              <label className="field">
                Preflight lead time (minutes before release)
                <input
                  type="number"
                  value={draft.preflightMinutesBeforeRelease}
                  onChange={(e) => updateDraft({ preflightMinutesBeforeRelease: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                Mode for this rule
                <select value={draft.mode} onChange={(e) => updateDraft({ mode: e.target.value as BookingRuleInput['mode'] })}>
                  <option value="mock">Mock (sandbox only)</option>
                  <option value="assisted">Assisted (opens real site)</option>
                </select>
              </label>
            </div>

            <h3 style={{ marginTop: 10 }}>Release schedule</h3>
            <div className="grid-2">
              <label className="field">
                Release timing
                <select
                  value={draft.release.kind}
                  onChange={(e) =>
                    updateDraft({
                      release:
                        e.target.value === 'one-off-timestamp'
                          ? { kind: 'one-off-timestamp', releaseAtUtc: new Date().toISOString(), verified: false }
                          : { kind: 'days-before-at-local-time', daysBefore: 7, localTime: '08:00', verified: false }
                    })
                  }
                >
                  <option value="days-before-at-local-time">N calendar days before, at club-local time</option>
                  <option value="one-off-timestamp">Exact one-off release timestamp (UTC)</option>
                </select>
              </label>
              {draft.release.kind === 'days-before-at-local-time' ? (
                <div className="row">
                  <label className="field">
                    Days before
                    <input
                      type="number"
                      value={draft.release.daysBefore}
                      onChange={(e) => updateDraft({ release: { ...draft.release, daysBefore: Number(e.target.value) } as BookingRuleInput['release'] })}
                    />
                  </label>
                  <label className="field">
                    Local time
                    <input
                      type="time"
                      value={draft.release.localTime}
                      onChange={(e) => updateDraft({ release: { ...draft.release, localTime: e.target.value } as BookingRuleInput['release'] })}
                    />
                  </label>
                </div>
              ) : (
                <label className="field">
                  Release timestamp (UTC, ISO 8601)
                  <input
                    value={draft.release.releaseAtUtc}
                    onChange={(e) => updateDraft({ release: { ...draft.release, releaseAtUtc: e.target.value } as BookingRuleInput['release'] })}
                  />
                </label>
              )}
            </div>
            <div className="callout warn">
              Release timing is <strong>user-entered, not verified</strong> against any confirmed club policy — this app does
              not assume all clubs release at midnight or use the same window. Double-check it against what the club
              actually told you.
            </div>

            <div className="row">
              <button className="btn secondary" disabled={busy} onClick={() => void handlePreview()}>
                Preview upcoming occurrences
              </button>
              <button className="btn secondary" onClick={() => setStep('club')}>
                Back
              </button>
              <button className="btn" disabled={busy} onClick={() => void handleCreateRule()}>
                Create rule &amp; continue to review
              </button>
            </div>

            {preview.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Play date</th>
                    <th>Play start (local → UTC)</th>
                    <th>Release (UTC)</th>
                    <th>Warnings</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p) => (
                    <tr key={p.playDate}>
                      <td>{p.playDate}</td>
                      <td className="mono">{p.playStartUtc}</td>
                      <td className="mono">{p.releaseAtUtc}</td>
                      <td className="muted">{p.warnings.map((w) => w.message).join(' ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {step === 'review' && review && (
          <div className="stack">
            <h3>Authorization review — read before arming</h3>
            <div className="callout warn">
              Arming authorizes this app to act within exactly these limits until you change or revoke it. Any material
              change (club, dates, price cap, payment method, cancellation policy) invalidates this authorization and
              requires review again.
            </div>
            <table>
              <tbody>
                <tr><td>Account</td><td>{review.accountLabel ?? '(not connected)'}</td></tr>
                <tr><td>Club</td><td>{review.club.name} — {review.club.location} ({review.club.timezone}) {review.club.verified ? '✅ verified' : '⚠️ user-entered'}</td></tr>
                <tr><td>Play date(s)</td><td className="mono">{JSON.stringify(review.playDate)}</td></tr>
                <tr><td>Preferred time / duration</td><td>{review.preferredStartTime} for {review.durationMinutes} min</td></tr>
                <tr><td>Allowed courts</td><td>{review.preferredCourtIds === 'any' ? 'Any eligible court' : review.preferredCourtIds.join(', ')}</td></tr>
                <tr><td>Fallback options</td><td>{review.exactTimeOnly ? 'None (exact-time-only)' : JSON.stringify(review.fallbackOptions)}</td></tr>
                <tr><td>Release schedule</td><td className="mono">{JSON.stringify(review.release)}</td></tr>
                <tr><td>Max total price</td><td>{review.maxTotalPrice} {review.currency}</td></tr>
                <tr><td>Max bookings</td><td>{review.maxSuccessfulBookingsPerOccurrence} per occurrence / {review.maxFutureActiveBookings} active total</td></tr>
                <tr><td>Payment method</td><td>{review.allowedPaymentMethodLabel}</td></tr>
                <tr><td>Cancellation policy</td><td>{review.cancellationPolicy.available ? review.cancellationPolicy.summary : '⚠️ Not available — unattended checkout will stop and require review.'}</td></tr>
                <tr><td>Authorization expiry</td><td>{review.authorizationExpiresAtUtc ?? 'No expiry set (revoke manually, or any material change revokes it automatically)'}</td></tr>
              </tbody>
            </table>
            <div className="row">
              <button className="btn secondary" onClick={() => setStep('rule')}>
                Back to edit
              </button>
              <button className="btn" disabled={busy} onClick={() => void handleArm()}>
                I have reviewed this — Arm the rule
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
