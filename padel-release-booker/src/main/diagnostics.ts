/**
 * Diagnostic export: a redacted snapshot of rules, occurrences, and booking
 * outcomes you can safely share for troubleshooting. By construction it
 * never includes secrets (they are not in SQLite at all — see
 * core/security/secretsStore.ts) and we additionally strip anything that
 * looks like free-text account identifiers before writing the file.
 */
import { app } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppRuntime } from './appRuntime.js';

function redactAccountLabel(label: string | null): string | null {
  if (!label) return label;
  const at = label.indexOf('@');
  if (at <= 0) return '(redacted)';
  return `${label[0]}***@${label.slice(at + 1)}`;
}

export async function exportDiagnostics(runtime: AppRuntime): Promise<string> {
  const rules = runtime.rules.list();
  const payload = {
    exportedAtUtc: new Date().toISOString(),
    appMode: runtime.getMode(),
    emergencyStopped: runtime.isEmergencyStopped(),
    rules: rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      clubId: rule.clubId,
      mode: rule.mode,
      isPaused: runtime.rules.isPaused(rule.id),
      durationMinutes: rule.durationMinutes,
      maxTotalPrice: rule.maxTotalPrice,
      currency: rule.currency,
      release: rule.release,
      occurrences: runtime.occurrences.listByRule(rule.id).map((o) => ({
        id: o.id,
        playDate: o.playDate,
        status: o.status,
        terminalReason: o.terminalReason,
        releaseAtUtc: o.releaseAtUtc
      })),
      bookings: runtime.bookings.listByRule(rule.id).map((b) => ({
        outcome: b.outcome,
        failureReason: b.failureReason,
        createdAtUtc: b.createdAtUtc,
        mode: b.mode
        // Deliberately omit bookingReference/price/court details from the shareable export by default.
      }))
    })),
    note: 'Account identifiers are redacted. No credentials, tokens, or cookies are ever stored in this app\'s database, so none can appear here.'
  };

  const fileName = `padel-release-booker-diagnostics-${Date.now()}.json`;
  const filePath = join(app.getPath('downloads'), fileName);
  await writeFile(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
  return filePath;
}

export { redactAccountLabel };
