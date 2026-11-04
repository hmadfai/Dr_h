/**
 * Real secrets store for the packaged app. Uses Electron's `safeStorage`
 * API, which on macOS delegates encryption-key protection to the system
 * Keychain (see Electron docs: "safeStorage ... uses session key storage
 * mechanisms offered by the OS — macOS Keychain"). We additionally encrypt
 * at rest in a JSON file under the app's userData directory with restrictive
 * (0600) permissions, so even the ciphertext-on-disk is not world-readable.
 *
 * Today, with only the mock and assisted adapters implemented, this store
 * has nothing sensitive to hold yet (assisted mode never receives your
 * Playtomic password — you type it directly into the real site in your own
 * browser). It exists now so a future adapter has a safe place to put
 * tokens, and so the "remove local session data" control has a real target.
 */

import { app, safeStorage } from 'electron';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { SecretsStore } from '../../core/security/secretsStore.js';

interface EncryptedFileShape {
  [key: string]: string; // base64-encoded encrypted bytes
}

export class ElectronSecretsStore implements SecretsStore {
  private readonly filePath: string;

  constructor(fileName = 'secrets.enc.json') {
    this.filePath = join(app.getPath('userData'), fileName);
  }

  private async readAll(): Promise<EncryptedFileShape> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as EncryptedFileShape;
    } catch {
      return {};
    }
  }

  private async writeAll(data: EncryptedFileShape): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data), { mode: 0o600 });
  }

  async set(key: string, value: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS-level encryption (macOS Keychain-backed safeStorage) is not available on this system.');
    }
    const all = await this.readAll();
    all[key] = safeStorage.encryptString(value).toString('base64');
    await this.writeAll(all);
  }

  async get(key: string): Promise<string | null> {
    const all = await this.readAll();
    const encoded = all[key];
    if (!encoded) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  }

  async delete(key: string): Promise<void> {
    const all = await this.readAll();
    delete all[key];
    await this.writeAll(all);
  }

  async clearAll(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}
