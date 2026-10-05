import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque, single-use linking credentials.
 *
 * Persist only the digest returned here; never persist or log the raw token.
 * The caller must enforce expiry and atomically consume the digest in storage.
 */
export interface TelegramLinkToken {
  token: string;
  digest: Buffer;
}

export function createTelegramLinkToken(): TelegramLinkToken {
  const token = randomBytes(32).toString('base64url');
  return { token, digest: digestTelegramLinkToken(token) };
}

export function digestTelegramLinkToken(token: string): Buffer {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Error('Invalid Telegram link token');
  }
  return createHash('sha256').update(token, 'utf8').digest();
}
