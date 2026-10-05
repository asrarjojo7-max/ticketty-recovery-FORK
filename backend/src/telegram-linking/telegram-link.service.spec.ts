import { createHmac } from 'node:crypto';
import { describe, expect, it, jest } from '@jest/globals';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { TelegramLinkService } from './telegram-link.service';

describe('TelegramLinkService', () => {
  const user = {
    sub: 'user-1',
    orgId: 'org-1',
    branchId: null,
    name: 'Owner',
    email: 'owner@example.test',
    roleKey: 'owner',
    permissions: [],
  } as const;

  function makeService() {
    const prisma = {
      createTelegramLinkChallenge: jest.fn(),
      confirmTelegramLink: jest.fn(),
      revokeTelegramLink: jest.fn(),
      findTelegramLinkForUser: jest.fn(),
      attachTelegramLinkChallenge: jest.fn(),
      withTenantContext: jest.fn(
        async (_orgId: string, callback: () => Promise<unknown>) => callback(),
      ),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new TelegramLinkService(prisma as never, audit as never),
      prisma,
      audit,
    };
  }

  it('creates a 43-character challenge and audits it inside tenant context', async () => {
    const { service, prisma, audit } = makeService();

    const result = await service.createChallenge(user);

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresInSeconds).toBe(600);
    expect(prisma.createTelegramLinkChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.sub,
        tokenDigest: expect.any(Buffer),
        telegramUserId: expect.stringMatching(/^pending:/),
        telegramChatId: expect.stringMatching(/^pending:/),
      }),
    );
    expect(prisma.withTenantContext).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
    );
    expect(audit.log).toHaveBeenCalledWith(
      user,
      'TELEGRAM_LINK_CHALLENGE_CREATED',
      'TelegramAccountLink',
      user.sub,
      expect.objectContaining({ expiresAt: expect.any(String) }),
    );
  });

  it('rejects an invalid Telegram identity before touching the database', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.attachTelegramIdentity(
        'A'.repeat(43),
        'not-a-telegram-id',
        '123',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.attachTelegramLinkChallenge).not.toHaveBeenCalled();
  });

  it('maps an already-linked Telegram identity to conflict', async () => {
    const { service, prisma } = makeService();
    prisma.attachTelegramLinkChallenge.mockRejectedValue(
      new Error('Telegram account is already linked'),
    );

    await expect(
      service.attachTelegramIdentity('A'.repeat(43), '123456', '123456'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('confirms for the authenticated user and audits in tenant context', async () => {
    const { service, prisma, audit } = makeService();
    prisma.confirmTelegramLink.mockResolvedValue({
      telegramUserId: '123456',
      telegramChatId: '654321',
    });

    const result = await service.confirm(user, 'A'.repeat(43));

    expect(result).toEqual({
      linked: true,
      telegramUserId: '123456',
      telegramChatId: '654321',
    });
    expect(prisma.confirmTelegramLink).toHaveBeenCalledWith(
      expect.any(Buffer),
      user.sub,
    );
    expect(prisma.withTenantContext).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
    );
    expect(audit.log).toHaveBeenCalledWith(
      user,
      'TELEGRAM_LINK_CONFIRMED',
      'TelegramAccountLink',
      user.sub,
      { telegramUserId: '123456' },
    );
  });

  it('revokes only the authenticated user link and audits the change', async () => {
    const { service, prisma, audit } = makeService();
    prisma.revokeTelegramLink.mockResolvedValue(true);

    await expect(service.revoke(user)).resolves.toEqual({ revoked: true });
    expect(prisma.revokeTelegramLink).toHaveBeenCalledWith(user.sub);
    expect(prisma.withTenantContext).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
    );
    expect(audit.log).toHaveBeenCalledWith(
      user,
      'TELEGRAM_LINK_REVOKED',
      'TelegramAccountLink',
      user.sub,
    );
  });

  it('accepts a valid internal HMAC signature', async () => {
    const { service } = makeService();
    const path = join(
      tmpdir(),
      `ticketty-telegram-link-${Date.now()}-${Math.random()}`,
    );
    const secret = 'test-link-hmac-secret';
    await writeFile(path, secret, { mode: 0o600 });
    process.env.TELEGRAM_LINK_HMAC_FILE = path;

    const timestamp = String(Math.floor(Date.now() / 1000));
    const canonical = ['POST', '/api/telegram/link/internal/attach', timestamp, 'A'.repeat(43), '123', '456'].join('\n');
    const signature =
      'v1=' + createHmac('sha256', secret).update(canonical).digest('hex');

    await expect(
      service.verifyInternalSignature(timestamp, signature, canonical),
    ).resolves.toBeUndefined();
  });

  it('rejects stale internal HMAC signatures', async () => {
    const { service } = makeService();
    const timestamp = String(Math.floor(Date.now() / 1000) - 61);
    await expect(
      service.verifyInternalSignature(
        timestamp,
        'v1=' + '0'.repeat(64),
        'canonical',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
