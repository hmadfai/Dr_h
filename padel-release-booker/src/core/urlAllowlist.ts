/**
 * Every URL this app opens externally (assisted-mode booking pages, "view
 * club" links, etc.) must pass this allowlist first. This is the only
 * defense between a corrupted/malicious club URL stored in the database (or
 * typed by the user) and the renderer/main process shelling out to an
 * arbitrary address.
 */

const ALLOWED_HOSTS = new Set(['playtomic.com', 'www.playtomic.com', 'app.playtomic.io']);

export class DisallowedUrlError extends Error {
  constructor(url: string) {
    super(`URL "${url}" is not on the Playtomic allowlist and was not opened.`);
  }
}

export function isAllowedExternalUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
}

/** Throws DisallowedUrlError if the URL is not allowlisted; otherwise returns the parsed URL. */
export function assertAllowedExternalUrl(rawUrl: string): URL {
  if (!isAllowedExternalUrl(rawUrl)) {
    throw new DisallowedUrlError(rawUrl);
  }
  return new URL(rawUrl);
}
