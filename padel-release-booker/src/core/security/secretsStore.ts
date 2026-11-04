/**
 * Narrow interface for storing secrets (session tokens, cookies, encryption
 * material) outside the SQLite database. The real implementation
 * (`main/security/electronSecretsStore.ts`) uses Electron's `safeStorage`
 * API, which on macOS encrypts using a key that is itself protected by the
 * user's macOS Keychain — the "maintained macOS Keychain integration"
 * required by this project, without depending on the unmaintained `keytar`
 * native module.
 *
 * This file stays framework-agnostic so the booking engine and tests never
 * import Electron.
 */

export interface SecretsStore {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  /** Permanently delete everything this store manages (used by "remove local session data"). */
  clearAll(): Promise<void>;
}

/** In-memory implementation for tests and for any core-layer code path that must not touch real Keychain/files. */
export class InMemorySecretsStore implements SecretsStore {
  private readonly data = new Map<string, string>();

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async clearAll(): Promise<void> {
    this.data.clear();
  }
}
