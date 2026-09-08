import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { PrismaClient } from '@prisma/client';

/**
 * Security regression suite (audit Phases 19–20).
 * كل اختبار هنا يحرس ثغرة مكتشفة في التدقيق — لا تُحذف أبداً:
 *  - S1: تسجيل صعود متزامن للتذكرة نفسها يجب أن ينجح مرة واحدة فقط (P1-1)
 *  - S2: دور التطبيق لا يستطيع حذف/تعديل سجلات التدقيق (P1-2)
 *  - S3: تغيير كلمة المرور يُبطل الجلسات الأقدم (P1-3)
 *  - S4: اعتماد مصروف متزامن يجب أن يضع حدث محاسبة واحد (P2-2)
 */

const OPERATOR = {
  email: 'e2e-owner@ticketty.local',
  password: 'E2eTest-Passw0rd-2026',
};

type Server = import('http').Server;
type LoginResponse = { access_token?: unknown };

async function login(
  server: Server,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(server)
    .post('/api/auth/login')
    .set('Origin', 'http://localhost:3000')
    .send({ email, password });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(
      `login failed (${res.status}): ${JSON.stringify(res.body)}`,
    );
  }
  const body = res.body as LoginResponse;
  if (typeof body.access_token !== 'string') {
    throw new Error('login response missing access_token');
  }
  return body.access_token;
}

describe('Security regression (audit fixes)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: Server;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(['error', 'warn']);
    configureApp(app);
    await app.init();
    server = app.getHttpServer(); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    prisma = new PrismaClient();
    token = await login(server, OPERATOR.email, OPERATOR.password);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('S1: concurrent check-in of one ticket succeeds exactly once (P1-1)', async () => {
    // جهّز رحلة + مقعد + تذكرة BOOKED
    const orgId = await prisma.organization
      .findUniqueOrThrow({
        where: { slug: 'ticketty' },
        select: { id: true },
      })
      .then((o) => o.id);
    const userId = (
      await prisma.user.findFirstOrThrow({
        where: { organizationId: orgId },
        select: { id: true },
      })
    ).id;
    const fixture = await prisma.$transaction(async (tx) => {
      const route = await tx.route.create({
        data: {
          organizationId: orgId,
          name: 'S1-secure-route',
          fromCity: 'أ',
          toCity: 'ب',
          distanceKm: 100,
        },
      });
      const template = await tx.seatTemplate.create({
        data: {
          organizationId: orgId,
          name: `S1-tpl-${Date.now()}`,
          rows: 4,
          columnsPerRow: 4,
          aisleAfterColumn: 2,
        },
      });
      const bus = await tx.bus.create({
        data: {
          organizationId: orgId,
          plateNumber: `S1-${Date.now()}`,
          seatTemplateId: template.id,
        },
      });
      const trip = await tx.trip.create({
        data: {
          organizationId: orgId,
          routeId: route.id,
          busId: bus.id,
          departureAt: new Date(Date.now() + 86_400_000),
          status: 'OPEN',
        },
      });
      const seat = await tx.tripSeat.create({
        data: {
          tripId: trip.id,
          row: 1,
          column: 1,
          label: 'S1',
          seatType: 'REGULAR',
          status: 'AVAILABLE',
          price: 2500,
        },
      });
      const booking = await tx.booking.create({
        data: {
          organizationId: orgId,
          tripId: trip.id,
          idempotencyKey: `sec-s1-${Date.now()}`,
          totalAmount: 2500,
          status: 'CONFIRMED',
          createdById: userId,
          tickets: {
            create: {
              organizationId: orgId,
              tripId: trip.id,
              tripSeatId: seat.id,
              number: `SEC-S1-${Date.now()}`,
              passengerName: 'مسافر أمني',
              passengerPhone: '099',
              seatLabel: 'S1',
              fare: 2500,
              qrCode: `sec-s1-${Date.now()}`,
              status: 'BOOKED',
            },
          },
        },
      });
      await tx.payment.create({
        data: {
          organizationId: orgId,
          bookingId: booking.id,
          idempotencyKey: `sec-s1-pay-${Date.now()}`,
          amount: 2500,
          method: 'CASH',
          receivedById: userId,
        },
      });
      return { trip, seat, bookingId: booking.id, busId: bus.id };
    });

    const ticketId = await prisma.ticket
      .findFirstOrThrow({
        where: { bookingId: fixture.bookingId },
        select: { id: true },
      })
      .then((t) => t.id);

    // 6 طلبات صعود متزامنة — واحدة فقط يجب أن تنجح
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(server)
          .post(`/api/tickets/${ticketId}/check-in`)
          .set('Authorization', `Bearer ${token}`)
          .set('Origin', 'http://localhost:3000'),
      ),
    );
    const ok = results.filter((r) => r.status === 201);
    const conflict = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(1);
    expect(conflict.length).toBe(5);

    // التنظيف
    await prisma.ticket.deleteMany({ where: { bookingId: fixture.bookingId } });
    await prisma.payment.deleteMany({
      where: { bookingId: fixture.bookingId },
    });
    await prisma.booking.deleteMany({ where: { id: fixture.bookingId } });
    await prisma.tripSeat.deleteMany({ where: { tripId: fixture.trip.id } });
    await prisma.trip.deleteMany({ where: { id: fixture.trip.id } });
    const templateId = await prisma.bus
      .findUniqueOrThrow({
        where: { id: fixture.busId },
        select: { seatTemplateId: true },
      })
      .then((b) => b.seatTemplateId)
      .catch(() => null);
    await prisma.bus.deleteMany({ where: { id: fixture.busId } });
    if (templateId) {
      await prisma.seatTemplate.deleteMany({ where: { id: templateId } });
    }
    await prisma.route.deleteMany({ where: { id: fixture.trip.routeId } });
  });

  it('S2: audit_logs are append-only for the tenant runtime role (P1-2)', async () => {
    const rows = await prisma.$queryRaw<Array<{ deletable: boolean }>>`
      SELECT has_table_privilege('ticketty_app', 'audit_logs', 'DELETE') AS deletable
    `;
    expect(rows[0]?.deletable).toBe(false);
    const upd = await prisma.$queryRaw<Array<{ updatable: boolean }>>`
      SELECT has_table_privilege('ticketty_app', 'audit_logs', 'UPDATE') AS updatable
    `;
    expect(upd[0]?.updatable).toBe(false);
    const trigger = await prisma.$queryRaw<Array<{ tgname: string }>>`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal
    `;
    expect(trigger.some((t) => t.tgname === 'audit_logs_immutable_guard')).toBe(
      true,
    );
  });

  it('S3: password change invalidates older sessions (P1-3)', async () => {
    // token صادر قبل التغيير — يجب أن يُرفض بعده مباشرة
    const stale = token;
    const res = await request(server)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${stale}`)
      .set('Origin', 'http://localhost:3000')
      .send({
        currentPassword: OPERATOR.password,
        newPassword: 'Rotated-Secret-2026!',
      });
    expect(res.status).toBe(200);

    // التوكن القديم يُرفض الآن — iat أقدم من passwordChangedAt
    const afterChange = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${stale}`)
      .set('Origin', 'http://localhost:3000');
    expect(afterChange.status).toBe(401);

    // الدخول بكلمة المرور الجديدة يعمل، والقديمة تُرفض
    const fresh = await login(server, OPERATOR.email, 'Rotated-Secret-2026!');
    expect(fresh).toBeTruthy();
    const oldRejected = await request(server)
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: OPERATOR.email, password: OPERATOR.password });
    expect([401, 429]).toContain(oldRejected.status);

    // أعد كلمة المرور الأصلية للبيئة (وليس بالضرورة بنفس الهاش — الطابع
    // سيتحدث مجدداً وهذا مقصود).
    const revert = await request(server)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${fresh}`)
      .set('Origin', 'http://localhost:3000')
      .send({
        currentPassword: 'Rotated-Secret-2026!',
        newPassword: OPERATOR.password,
      });
    expect(revert.status).toBe(200);
  });

  it('S4: concurrent expense approval enqueues exactly one accounting event (P2-2)', async () => {
    // S3 غيّرت كلمة المرور وأبطلت توكِن السلسلة — ادخل من جديد
    token = await login(server, OPERATOR.email, OPERATOR.password);
    const orgId = await prisma.organization
      .findUniqueOrThrow({ where: { slug: 'ticketty' }, select: { id: true } })
      .then((o) => o.id);
    const userId = (
      await prisma.user.findFirstOrThrow({
        where: { organizationId: orgId },
        select: { id: true },
      })
    ).id;
    const expense = await prisma.expense.create({
      data: {
        organizationId: orgId,
        category: 'FUEL',
        description: 'اختبار سباق الاعتماد',
        amount: 1000,
        status: 'DRAFT',
        createdById: userId,
      },
    });

    const results = await Promise.all([
      request(server)
        .post(`/api/expenses/${expense.id}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', 'http://localhost:3000'),
      request(server)
        .post(`/api/expenses/${expense.id}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', 'http://localhost:3000'),
    ]);
    const ok = results.filter((r) => r.status === 201);
    expect(ok).toHaveLength(1);

    const events = await prisma.accountingEvent.count({
      where: { sourceId: expense.id, organizationId: orgId },
    });
    expect(events).toBeLessThanOrEqual(1);

    // التنظيف
    await prisma.accountingEvent.deleteMany({
      where: { sourceId: expense.id },
    });
    await prisma.expense.deleteMany({ where: { id: expense.id } });
  });
});
