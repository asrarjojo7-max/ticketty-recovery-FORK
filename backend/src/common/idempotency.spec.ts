import { BadRequestException, ConflictException } from '@nestjs/common';
import { IdempotencyStatus, Prisma } from '@prisma/client';
import {
  beginIdempotentOperation,
  idempotencyRequestHash,
  requireIdempotencyKey,
} from './idempotency';

describe('idempotency primitives', () => {
  it('requires a bounded client key', () => {
    expect(() => requireIdempotencyKey('short')).toThrow(BadRequestException);
    expect(requireIdempotencyKey('request-key-123')).toBe('request-key-123');
  });

  it('produces a stable request hash independent of object key order', () => {
    expect(
      idempotencyRequestHash({
        id: '1',
        nested: { amount: 10, reason: 'test' },
      }),
    ).toBe(
      idempotencyRequestHash({
        nested: { reason: 'test', amount: 10 },
        id: '1',
      }),
    );
  });

  it('replaces an expired key instead of replaying it forever', async () => {
    const remove = jest.fn().mockResolvedValue({ id: 'expired-record' });
    const create = jest.fn().mockResolvedValue({ id: 'new-record' });
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue([]),
      idempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'expired-record',
          requestHash: 'old-hash',
          expiresAt: new Date(Date.now() - 60_000),
        }),
        delete: remove,
        create,
      },
    } as unknown as Prisma.TransactionClient;

    const result = await beginIdempotentOperation(
      tx,
      'org-1',
      'booking.cancel',
      'request-key-123',
      'new-hash',
    );

    expect(remove).toHaveBeenCalledWith({ where: { id: 'expired-record' } });
    expect(create).toHaveBeenCalled();
    expect(result.replay).toBe(false);
  });

  it('replays a completed operation even after its processing lease expires', async () => {
    const remove = jest.fn();
    const record = {
      id: 'completed-record',
      requestHash: 'same-hash',
      status: IdempotencyStatus.COMPLETED,
      expiresAt: new Date(Date.now() - 60_000),
    };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue([]),
      idempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(record),
        create: jest.fn(),
        delete: remove,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      beginIdempotentOperation(
        tx,
        'org-1',
        'bookings.create',
        'request-key-123',
        'same-hash',
      ),
    ).resolves.toEqual({ record, replay: true });
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects reuse of a key with a different request hash', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'record-1',
      requestHash: 'original-hash',
      status: IdempotencyStatus.COMPLETED,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue([]),
      idempotencyRecord: {
        findUnique,
        create: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      beginIdempotentOperation(
        tx,
        'org-1',
        'booking.cancel',
        'request-key-123',
        'different-hash',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
