import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { defer, from, lastValueFrom } from 'rxjs';
import { TenantRlsInterceptor } from '../src/common/interceptors/tenant-rls.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

const RLS_TABLES = [
  'accounting_events',
  'accounting_policies',
  'accounts',
  'agents',
  'audit_logs',
  'bookings',
  'branches',
  'buses',
  'commissions',
  'customers',
  'drivers',
  'expense_adjustments',
  'expenses',
  'fiscal_periods',
  'idempotency_records',
  'journal_entries',
  'journal_entry_lines',
  'journals',
  'manifests',
  'organizations',
  'payments',
  'refunds',
  'route_stops',
  'routes',
  'seat_templates',
  'seats',
  'settlement_lines',
  'settlements',
  'tickets',
  'trip_seats',
  'trips',
  'users',
  'roles',
];

describe('runtime PostgreSQL RLS', () => {
  const owner = new PrismaClient();
  const prisma = new PrismaService();
  const suffix = randomUUID();
  const organizationA = `rls-org-a-${suffix}`;
  const organizationB = `rls-org-b-${suffix}`;
  const branchA = `rls-branch-a-${suffix}`;
  const branchB = `rls-branch-b-${suffix}`;
  const routeA = `rls-route-a-${suffix}`;
  const routeB = `rls-route-b-${suffix}`;
  const stopA = `rls-stop-a-${suffix}`;
  const stopB = `rls-stop-b-${suffix}`;

  beforeAll(async () => {
    await Promise.all([owner.$connect(), prisma.$connect()]);
    await owner.organization.createMany({
      data: [
        { id: organizationA, name: 'RLS A', slug: organizationA },
        { id: organizationB, name: 'RLS B', slug: organizationB },
      ],
    });
    await owner.branch.createMany({
      data: [
        {
          id: branchA,
          organizationId: organizationA,
          name: 'Branch A',
          city: 'A',
        },
        {
          id: branchB,
          organizationId: organizationB,
          name: 'Branch B',
          city: 'B',
        },
      ],
    });
    await owner.route.createMany({
      data: [
        {
          id: routeA,
          organizationId: organizationA,
          name: 'Route A',
          fromCity: 'A',
          toCity: 'B',
        },
        {
          id: routeB,
          organizationId: organizationB,
          name: 'Route B',
          fromCity: 'B',
          toCity: 'C',
        },
      ],
    });
    await owner.routeStop.createMany({
      data: [
        { id: stopA, routeId: routeA, city: 'A', order: 1 },
        { id: stopB, routeId: routeB, city: 'B', order: 1 },
      ],
    });
  });

  afterAll(async () => {
    await owner.organization.deleteMany({
      where: { id: { in: [organizationA, organizationB] } },
    });
    await Promise.all([owner.$disconnect(), prisma.$disconnect()]);
  });

  it('enables RLS on every tenant-owned runtime table', async () => {
    const rows = await owner.$queryRaw<Array<{ name: string }>>`
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relrowsecurity
      ORDER BY c.relname
    `;
    const enabled = new Set(rows.map((row) => row.name));

    expect(RLS_TABLES.filter((table) => !enabled.has(table))).toEqual([]);
  });

  it('uses a non-owner role without BYPASSRLS', async () => {
    const [role] = await prisma.withTenantContext(
      organizationA,
      () =>
        prisma.$queryRaw<
          Array<{ name: string; bypass: boolean; owns: boolean }>
        >`
          SELECT
            current_user AS name,
            r.rolbypassrls AS bypass,
            c.relowner = r.oid AS owns
          FROM pg_roles r
          CROSS JOIN pg_class c
          WHERE r.rolname = current_user
            AND c.relname = 'branches'
            AND c.relnamespace = 'public'::regnamespace
        `,
    );

    expect(role).toEqual({ name: 'ticketty_app', bypass: false, owns: false });
  });

  it('shows only rows belonging to the transaction tenant', async () => {
    const branches = await prisma.withTenantContext(organizationA, () =>
      prisma.branch.findMany({
        where: { id: { in: [branchA, branchB] } },
        orderBy: { id: 'asc' },
      }),
    );

    expect(branches.map((branch) => branch.id)).toEqual([branchA]);
  });

  it('keeps the RLS context across the Nest interceptor observable', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const interceptor = new TenantRlsInterceptor(prisma, reflector);
    const context = {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({
        getRequest: () => ({ user: { orgId: organizationA } }),
      }),
    } as unknown as ExecutionContext;
    const next = {
      handle: () =>
        defer(() =>
          from(
            prisma.branch.findMany({
              where: { id: { in: [branchA, branchB] } },
            }),
          ),
        ),
    } as CallHandler;

    const branches = (await lastValueFrom(
      interceptor.intercept(context, next),
    )) as Array<{ id: string }>;

    expect(branches.map((branch) => branch.id)).toEqual([branchA]);
  });

  it('isolates child tables that inherit tenant scope from a parent', async () => {
    const stops = await prisma.withTenantContext(organizationA, () =>
      prisma.routeStop.findMany({
        where: { id: { in: [stopA, stopB] } },
      }),
    );

    expect(stops.map((stop) => stop.id)).toEqual([stopA]);
  });

  it('fails closed when runtime role has no tenant context', async () => {
    const branches = await owner.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL ROLE ticketty_app');
      return transaction.branch.findMany({
        where: { id: { in: [branchA, branchB] } },
      });
    });

    expect(branches).toEqual([]);
  });

  it('rejects cross-tenant writes at the database policy', async () => {
    await expect(
      prisma.withTenantContext(organizationA, () =>
        prisma.branch.create({
          data: {
            organizationId: organizationB,
            name: 'Rejected cross-tenant branch',
            city: 'X',
          },
        }),
      ),
    ).rejects.toBeDefined();
  });

  it('keeps nested service transactions inside the tenant transaction', async () => {
    const count = await prisma.withTenantContext(organizationA, () =>
      prisma.$transaction((transaction) =>
        transaction.branch.count({
          where: { id: { in: [branchA, branchB] } },
        }),
      ),
    );

    expect(count).toBe(1);
  });
});
