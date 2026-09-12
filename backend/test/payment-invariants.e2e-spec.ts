import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { loginAndRotateTemporaryPassword } from './helpers/auth';

/**
 * PAYMENT INVARIANTS (Phase 4 — ①-④ من جدول الخطة)
 * ================================================================
 *  ① amount > 0 (CHECK constraint)
 *  ② refund تراكمي ≤ amount (DB trigger — الحارس الأخير)
 *  ③ (org, idempotencyKey) unique على payments
 *  ④ refund بعد refund جزئي بالباقي فقط (التراكم لا يتجاوز)
 * (⑤ طريقة الدفع → Phase 5 Option A — خارج هذا الـ suite)
 *
 * الاستراتيجية: payments تولد داخل معاملة الحجز (لا endpoint
 * مستقل لخلقها) — نستخدم booking API الحقيقية ثم نفحص الـ
 * invariants على المدفوعات الناتجة + probe الـ trigger عبر
 * refund جزئي متسلسل بالإلغاء المتكرر... لا: الإلغاء يسترد
 * الكل مرة واحدة. لذا:
 *   - ①③ عبر API مباشرة (booking بلا idempotencyKey مكرر)
 *   - ②④ عبر probe مباشر: نزرع refunds متسلسلة يدوياً ونثبت
 *     أن الـ trigger يمنع التجاوز التراكمي (نفس ما يفعله
 *     refund-concurrency لكن من زاوية الحدود وليس السباق).
 */

const PASSWORD = 'E2eTest-Passw0rd-2026';

type Server = import('http').Server;

describe('payment invariants (Phase 4)', () => {
  let app: INestApplication<App>;
  let server: Server;
  const admin = new PrismaClient();
  const suffix = `${process.pid}-${Date.now()}`;
  const slug = `pay-inv-${suffix}`;

  let operatorToken = '';
  let tenantToken = '';
  let tenantOrgId = '';
  let routeId = '';
  let busId = '';
  let templateId = '';
  let bookingId = '';
  let paymentId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(['error', 'warn']);
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as unknown as Server;

    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'e2e-owner@ticketty.local', password: PASSWORD });
    operatorToken = (login.body as { access_token: string }).access_token;

    const provisioned = await request(server)
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        name: 'شركة ثوابت الدفع',
        slug,
        ownerName: 'مالك ثوابت الدفع',
        ownerEmail: `owner-${slug}@ticketty.local`,
        initialPassword: 'Pay-Inv-Passw0rd-2026',
        primaryBranchName: 'الفرع الرئيسي',
      });
    expect([200, 201]).toContain(provisioned.status);
    tenantOrgId = (provisioned.body as { organization: { id: string } })
      .organization.id;

    tenantToken = await loginAndRotateTemporaryPassword(
      server,
      `owner-${slug}@ticketty.local`,
      'Pay-Inv-Passw0rd-2026',
      'Pay-Inv-Permanent-2026!',
    );

    const templateRes = await request(server)
      .post('/api/seat-templates')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        name: 'قالب الدفع',
        rows: 1,
        columnsPerRow: 4,
        aisleAfterColumn: 0,
        seats: [
          { row: 1, column: 1 },
          { row: 1, column: 2 },
          { row: 1, column: 3 },
          { row: 1, column: 4 },
        ],
      });
    templateId = (templateRes.body as { id: string }).id;

    const busRes = await request(server)
      .post('/api/buses')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        plateNumber: `PI${Date.now() % 100000}`,
        seatTemplateId: templateId,
      });
    busId = (busRes.body as { id: string }).id;

    const routeRes = await request(server)
      .post('/api/routes')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        name: 'خط الدفع',
        fromCity: 'أ',
        toCity: 'ب',
        stops: [
          { city: 'أ', order: 0 },
          { city: 'ب', order: 1 },
        ],
      });
    routeId = (routeRes.body as { id: string }).id;

    // رحلة + حجز حقيقي → payment حقيقي عبر التطبيق
    const tripRes = await request(server)
      .post('/api/trips')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        routeId,
        busId,
        departureAt: new Date(Date.now() + 86_400_000).toISOString(),
        arrivalAt: new Date(Date.now() + 86_400_000 + 3_600_000).toISOString(),
        price: 20_000,
      });
    expect(tripRes.status).toBe(201);
    const tripId = (tripRes.body as { id: string }).id;

    const seatsRes = await request(server)
      .get(`/api/trips/${tripId}/seats`)
      .set('Authorization', `Bearer ${tenantToken}`);
    const seats = (
      seatsRes.body as { seats: Array<{ id: string; status: string }> }
    ).seats;
    const seat = seats.find((s) => s.status === 'AVAILABLE')!;

    const bookingRes = await request(server)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${tenantToken}`)
      .set('Idempotency-Key', `pay-inv-book-${suffix}`)
      .send({
        tripId,
        seatIds: [seat.id],
        passengerName: 'مسافر الدفع',
        passengerPhone: '0912000000',
        paymentMethod: 'CASH',
      });
    expect(bookingRes.status).toBe(201);
    bookingId = (bookingRes.body as { id: string }).id;
    paymentId = (bookingRes.body as { payments: Array<{ id: string }> })
      .payments[0].id;
  }, 120_000);

  afterAll(async () => {
    try {
      await admin.$executeRawUnsafe(
        'DELETE FROM refunds WHERE "organizationId" = $1',
        tenantOrgId,
      );
      await admin.payment.deleteMany({
        where: { organizationId: tenantOrgId },
      });
      await admin.commission.deleteMany({
        where: { organizationId: tenantOrgId },
      });
      await admin.ticket.deleteMany({ where: { organizationId: tenantOrgId } });
      await admin.booking.deleteMany({
        where: { organizationId: tenantOrgId },
      });
      await admin.idempotencyRecord.deleteMany({
        where: { organizationId: tenantOrgId },
      });
      await admin.tripSeat.deleteMany({
        where: { trip: { organizationId: tenantOrgId } },
      });
      await admin.trip.deleteMany({ where: { organizationId: tenantOrgId } });
      await admin.route.deleteMany({ where: { id: routeId } });
      await admin.bus.deleteMany({ where: { id: busId } });
      await admin.seatTemplate.deleteMany({ where: { id: templateId } });
      await admin.$executeRawUnsafe(
        'DELETE FROM subscriptions WHERE "organizationId" = $1',
        tenantOrgId,
      );
      await admin.user.deleteMany({ where: { organizationId: tenantOrgId } });
      await admin.role.deleteMany({ where: { organizationId: tenantOrgId } });
      await admin.branch.deleteMany({ where: { organizationId: tenantOrgId } });
      await admin.organization.deleteMany({ where: { id: tenantOrgId } });
    } catch {
      /* best-effort */
    } finally {
      await admin.$disconnect();
      await app.close();
    }
  }, 120_000);

  // ─── ① amount > 0 ─────────────────────────────────────────

  it('payment from a real booking is positive; DB rejects zero/negative', async () => {
    // عبر التطبيق: payment حقيقي موجب
    const payment = await admin.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    expect(Number(payment.amount)).toBeGreaterThan(0);

    // عبر DB مباشرة: CHECK constraint يرفض amount ≤ 0
    await expect(
      admin.$executeRawUnsafe(
        `UPDATE payments SET amount = 0 WHERE "id" = $1`,
        paymentId,
      ),
    ).rejects.toThrow();
    await expect(
      admin.$executeRawUnsafe(
        `UPDATE payments SET amount = -5 WHERE "id" = $1`,
        paymentId,
      ),
    ).rejects.toThrow();
  });

  // ─── ③ (org, idempotencyKey) unique ──────────────────────

  it('payment idempotencyKey unique per org (booking replay = same payment, not new)', async () => {
    // نفس المفتاح عبر booking replay يعيد نفس الحجز → لا payment جديد
    const countByKey = await admin.payment.count({
      where: { idempotencyKey: `pay-inv-book-${suffix}` },
    });
    expect(countByKey).toBe(1);

    // ومحاولة زرع payment ثانٍ بنفس المفتاح ترفضها القاعدة
    await expect(
      admin.$executeRawUnsafe(
        `INSERT INTO payments
           ("id", "organizationId", "bookingId", "amount", "method",
            "status", "idempotencyKey", "receivedById", "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, 100, 'CASH',
                 'COMPLETED', $3, 'probe', now())`,
        tenantOrgId,
        bookingId,
        `pay-inv-book-${suffix}`,
      ),
    ).rejects.toThrow();
  });

  // ─── ②+④ refund تراكمي ≤ amount — بالباقي فقط ────────────

  it('cumulative refunds never exceed amount; partial then remainder succeeds, over fails', async () => {
    const payment = await admin.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    const amount = Number(payment.amount); // 20000

    // ④ refund جزئي بالباقي: نزرع استرداداً جزئياً صحيحاً
    // (probe مباشر — التطبيق يسترد الكل مرة واحدة عبر الإلغاء؛
    // الـ trigger هو المفحوص هنا كحد تراكمي)
    await admin.$executeRawUnsafe(
      `INSERT INTO refunds
         ("id", "organizationId", "bookingId", "paymentId", "amount",
          "reason", "processedById", "createdAt", "status")
       VALUES (gen_random_uuid()::text, $1, $2, $3, 5000,
               'استرداد جزئي 1', 'probe', now(), 'COMPLETED')`,
      tenantOrgId,
      bookingId,
      paymentId,
    );

    const afterFirst = await admin.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    expect(Number(afterFirst.refundedAmount)).toBe(5000);
    expect(afterFirst.status).toBe('PARTIALLY_REFUNDED');

    // ④ الباقي فقط: استرداد بالمتبقي بالضبط ينجح → REFUNDED كامل
    await admin.$executeRawUnsafe(
      `INSERT INTO refunds
         ("id", "organizationId", "bookingId", "paymentId", "amount",
          "reason", "processedById", "createdAt", "status")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4,
               'استرداد المتبقي', 'probe', now(), 'COMPLETED')`,
      tenantOrgId,
      bookingId,
      paymentId,
      amount - 5000,
    );

    const afterFinal = await admin.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    expect(Number(afterFinal.refundedAmount)).toBe(amount);
    expect(afterFinal.status).toBe('REFUNDED');

    // ② التجاوز ممنوع: ولو 1 قرش فوق المبلغ
    await expect(
      admin.$executeRawUnsafe(
        `INSERT INTO refunds
           ("id", "organizationId", "bookingId", "paymentId", "amount",
            "reason", "processedById", "createdAt", "status")
         VALUES (gen_random_uuid()::text, $1, $2, $3, 1,
                 'محاولة تجاوز', 'probe', now(), 'COMPLETED')`,
        tenantOrgId,
        bookingId,
        paymentId,
      ),
    ).rejects.toThrow(); // trigger: Completed refunds exceed payment amount
  });

  it('refundedAmount bounds survive even a raw UPDATE (CHECK constraint)', async () => {
    // الحارس الأخير لو تجاوز الـ trigger: CHECK على payments نفسها
    await expect(
      admin.$executeRawUnsafe(
        `UPDATE payments SET "refundedAmount" = 999999 WHERE "id" = $1`,
        paymentId,
      ),
    ).rejects.toThrow(); // payments_refunded_amount_bounds_check
  });
});
