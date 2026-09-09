import { ForbiddenException } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from './tickets.service';

const authenticatedUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  sub: 'user-1',
  orgId: 'org-1',
  branchId: null,
  name: 'Test User',
  email: 'test@example.com',
  roleKey: 'OWNER',
  permissions: ['*'],
  ...overrides,
});

describe('TicketsService tenant isolation', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const prisma = {
    ticket: { findMany, findFirst },
  } as unknown as PrismaService;
  const audit = { log: jest.fn() } as unknown as AuditService;
  const service = new TicketsService(prisma, audit);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fails closed when a user has no organization', async () => {
    await expect(
      service.findAll(authenticatedUser({ orgId: null }), {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('scopes ticket lists to the organization and branch', async () => {
    findMany.mockResolvedValue([]);

    await service.findAll(
      authenticatedUser({ orgId: 'org-1', branchId: 'branch-1' }),
      { tripId: 'trip-1' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          trip: { branchId: 'branch-1' },
          tripId: 'trip-1',
        },
      }),
    );
  });

  it('scopes ticket lookup by id to the organization', async () => {
    findFirst.mockResolvedValue({ id: 'ticket-1' });

    await service.findOne(authenticatedUser(), 'ticket-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ticket-1', organizationId: 'org-1' },
      }),
    );
  });

  it('scopes QR lookup to the organization and branch', async () => {
    findFirst.mockResolvedValue({ id: 'ticket-1' });

    await service.findByQr(
      authenticatedUser({ branchId: 'branch-1' }),
      'qr-token',
    );

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          // Group B: البوابة تقبل رمز QR أو رقم التذكرة المطبوع (TKT-…) —
          // ودائمًا داخل نطاق المنظمة/الفرع (عزل المستأجرين كما هو).
          OR: [{ qrCode: 'qr-token' }, { number: 'qr-token' }],
          organizationId: 'org-1',
          trip: { branchId: 'branch-1' },
        },
      }),
    );
  });
});
