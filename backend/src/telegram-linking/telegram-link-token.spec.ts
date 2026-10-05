import {
  createTelegramLinkToken,
  digestTelegramLinkToken,
} from './telegram-link-token';

describe('Telegram link token', () => {
  it('creates a high-entropy opaque token and a fixed-size digest', () => {
    const result = createTelegramLinkToken();
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.digest).toHaveLength(32);
    expect(result.digest.equals(digestTelegramLinkToken(result.token))).toBe(
      true,
    );
  });

  it('creates different tokens for separate challenges', () => {
    expect(createTelegramLinkToken().token).not.toBe(
      createTelegramLinkToken().token,
    );
  });

  it('rejects malformed token input', () => {
    for (const token of ['', 'short', 'x'.repeat(44), 'a'.repeat(42) + '=']) {
      expect(() => digestTelegramLinkToken(token)).toThrow(
        'Invalid Telegram link token',
      );
    }
  });
});
