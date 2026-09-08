import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports liveness without requiring dependencies', () => {
    const prisma = {} as PrismaService;
    expect(new HealthService(prisma).liveness()).toEqual({ status: 'ok' });
  });

  it('reports readiness when PostgreSQL responds', async () => {
    const prisma = {
      ping: jest.fn().mockResolvedValue(undefined),
    } as unknown as PrismaService;
    await expect(new HealthService(prisma).readiness()).resolves.toEqual({
      status: 'ready',
      database: 'up',
      // تعذر قياس الـ staleness في هذا الـ mock — لا يغير الجاهزية.
      stalePendingAccountingEvents: -1,
    });
  });

  it('reports stale accounting events count when query succeeds', async () => {
    const prisma = {
      ping: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([{ count: 3 }]),
    } as unknown as PrismaService;
    await expect(new HealthService(prisma).readiness()).resolves.toMatchObject({
      status: 'ready',
      stalePendingAccountingEvents: 3,
    });
  });

  it('fails readiness without leaking the database error', async () => {
    const prisma = {
      ping: jest.fn().mockRejectedValue(new Error('secret connection data')),
    } as unknown as PrismaService;
    await expect(new HealthService(prisma).readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
