import { describe, expect, it } from 'vitest';
import { assertAllowedExternalUrl, DisallowedUrlError, isAllowedExternalUrl } from '../../src/core/urlAllowlist.js';

describe('urlAllowlist', () => {
  it('allows https URLs on the real Playtomic hosts', () => {
    expect(isAllowedExternalUrl('https://playtomic.com/clubs/some-club')).toBe(true);
    expect(isAllowedExternalUrl('https://www.playtomic.com/clubs/some-club')).toBe(true);
    expect(isAllowedExternalUrl('https://app.playtomic.io/anything')).toBe(true);
  });

  it('rejects non-Playtomic hosts, including look-alikes', () => {
    expect(isAllowedExternalUrl('https://playtomic.com.evil.example/')).toBe(false);
    expect(isAllowedExternalUrl('https://notplaytomic.com/')).toBe(false);
    expect(isAllowedExternalUrl('https://evil.example/?redirect=playtomic.com')).toBe(false);
  });

  it('rejects non-https schemes even on an allowed host', () => {
    expect(isAllowedExternalUrl('http://playtomic.com/')).toBe(false);
    expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects malformed URLs without throwing', () => {
    expect(isAllowedExternalUrl('not a url')).toBe(false);
  });

  it('assertAllowedExternalUrl throws DisallowedUrlError for disallowed URLs and returns a URL otherwise', () => {
    expect(() => assertAllowedExternalUrl('https://evil.example/')).toThrow(DisallowedUrlError);
    expect(assertAllowedExternalUrl('https://playtomic.com/clubs/x').hostname).toBe('playtomic.com');
  });
});
