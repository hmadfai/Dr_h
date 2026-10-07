import { shell } from 'electron';
import type { ExternalUrlOpener } from '../../core/adapters/assistedAdapter.js';
import { assertAllowedExternalUrl } from '../../core/urlAllowlist.js';

/** The only place in the whole app that calls `shell.openExternal`. Every call is re-validated against the allowlist, even though callers should already have validated too (defense in depth). */
export class ElectronExternalUrlOpener implements ExternalUrlOpener {
  async open(url: string): Promise<void> {
    const parsed = assertAllowedExternalUrl(url);
    await shell.openExternal(parsed.toString());
  }
}
