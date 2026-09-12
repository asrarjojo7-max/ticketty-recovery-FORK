import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { AccountingEventWorker } from '../src/accounting/accounting-event.worker';
import { loginAndRotateTemporaryPassword } from './helpers/auth';

/**
 * SEAT RACE (Go-Live Gate: T-1) — السباق الحقيقي المتزامن لنفس المقعد
 * ===================================================================
 * الغرض: إثبات حماية البيع المزدوج الموجودة (claim الشرطي الذرّي في
 * bookings.service) تحت هجوم متزامن فعلي — ليس إعادة تصميمها.
 *
 * السيناريو: N باائع (طلبات HTTP حية متوازية من مستخدمين مختلفين
 * بمفاتيح idempotency مختلفة) يحاولون شراء **نفس الرحلة + نفس المقعد**
 * في نفس اللحظة. المطالبات:
 *   ① نجاح واحد فقط (201)
 *   ② فشل صحيح للباقي (409 — لا 500، لا نجاح صامت)
 *   ③ لا حجز مزدوج: booking واحد + تذكرة واحدة + دفعة واحدة
 *   ④ لا حدث محاسبي مزدوج: PAYMENT_RECEIVED واحد بالضبط
 *   ⑤ الحالة النهائية للمقعد: BOOKED بـ ticketId واحد — لا يتيم
 *   ⑥ المعالج المحاسبي يرحّل الحدث الوحيد مرة واحدة (لا قيد مزدوج)
 *
 * لماذا هذا الاختبار كان مفقودًا: كل اختبارات الحجز الحالية تسلسلية
 * («مقعد مبيع لا يُبع ثانية» بعد إتمام البيع الأول). الحماية منطقية
 * وموجودة — هذا الاختبار يثبتها تحت التزامن الفعلي.
 *
 * ملاحظة مهمة عن طبيعة السباق: الطلبات تُطلق متوازية عبر Promise.all
 * على الـ HTTP server نفسه — كلها تصل للخدمة قبل اكتمال الأولى (النافذة
 * الحرجة هي بين قراءة المقعد وclaim الشرطي). الإخفاق في claim يجعل
 * الطلب يفشل ذرّيًا (ConflictException داخل $transaction) — لا أثر جزئي.
 */

const OPERATOR_PASSWORD = 'E2eTest-Passw0rd-2026';
const TENANT_PASSWORD = 'Seat-Race-Passw0rd-2026';
const SELLER_PASSWORD = 'Seat-Race-Seller-Passw0rd-2026';
const CONCURRENT_BUYERS = 8;

type Server = import('http').Server;

describe('seat race (Go-Live T-1): concurrent same-seat purchase', () => {
  let app: INestApplication<App>;
  let server: Server;
  const admin = new PrismaClient();
  const suffix = `${process.pid}-${Date.now()}`;
  const slug = `seat-race-${suffix}`;

  let operatorToken = '';
  let ownerToken = '';
  let sellerToken = '';
  let orgId = '';
  let routeId = '';
  let templateId = '';
  let tripId = '';
  let seatId = '';
  let seatPrice = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(['error', 'warn']);
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as unknown as Server;

    // 1) مشغل المنصة يزوّد الشركة (بما فيها المحاسبة — Blocker-1)
    const opLogin = await request(server).post('/api/auth/login').send({
      email: 'e2e-owner@ticketty.local',
      password: OPERATOR_PASSWORD,
    });
    expect([200, 201]).toContain(opLogin.status);
    operatorToken = (opLogin.body as { access_token: string }).access_token;

    const provisioned = await request(server)
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        name: 'شركة سباق المقاعد',
        slug,
        ownerName: 'مالك سباق المقاعد',
        ownerEmail: `owner-${slug}@ticketty.local`,
        initialPassword: TENANT_PASSWORD,
        primaryBranchName: 'الفرع الرئيسي',
      });
    expect([200, 201]).toContain(provisioned.status);
    orgId = (provisioned.body as { organization: { id: string } }).organization
      .id;

    // 2) المالك + بائع (السباق من البائعين — مثل نقاط البيع الحقيقية)
    ownerToken = await loginAndRotateTemporaryPassword(
      server,
      `owner-${slug}@ticketty.local`,
      TENANT_PASSWORD,
      `${TENANT_PASSWORD}-Permanent`,
    );

    const roles = await request(server)
      .get('/api/administration/roles')
      .set('Authorization', `Bearer ${ownerToken}`);
    const sellerRole = (roles.body as Array<{ key: string; id: string }>).find(
      (r) => r.key === 'SELLER',
    );
    expect(sellerRole).toBeTruthy();

    const sellerRes = await request(server)
      .post('/api/administration/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'بائع السباق',
        email: `seller-${slug}@ticketty.local`,
        password: SELLER_PASSWORD,
        roleId: sellerRole!.id,
      });
    expect(sellerRes.status).toBe(201);

    sellerToken = await loginAndRotateTemporaryPassword(
      server,
      `seller-${slug}@ticketty.local`,
      SELLER_PASSWORD,
      `${SELLER_PASSWORD}-Permanent`,
    );

    // 3) أسطول + خط + رحلة غدًا بمقعد واحد على الأقل
    const templateRes = await request(server)
      .post('/api/seat-templates')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'قالب السباق',
        rows: 2,
        columnsPerRow: 2,
        aisleAfterColumn: 0,
        seats: [
          { row: 1, column: 1 },
          { row: 1, column: 2 },
          { row: 2, column: 1 },
          { row: 2, column: 2 },
        ],
      });
    expect(templateRes.status).toBe(201);
    templateId = (templateRes.body as { id: string }).id;

    const busRes = await request(server)
      .post('/api/buses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        plateNumber: `SR${Date.now() % 100000}`,
        seatTemplateId: templateId,
      });
    expect(busRes.status).toBe(201);
    const busId = (busRes.body as { id: string }).id;

    const routeRes = await request(server)
      .post('/api/routes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'خط السباق',
        fromCity: 'أ',
        toCity: 'ب',
        stops: [
          { city: 'أ', order: 0 },
          { city: 'ب', order: 1 },
        ],
      });
    expect(routeRes.status).toBe(201);
    routeId = (routeRes.body as { id: string }).id;

    const departure = new Date(Date.now() + 48 * 3_600_000);
    const tripRes = await request(server)
      .post('/api/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        routeId,
        busId,
        departureAt: departure.toISOString(),
        arrivalAt: new Date(departure.getTime() + 5 * 3_600_000).toISOString(),
        price: 12_500,
      });
    expect(tripRes.status).toBe(201);
    tripId = (tripRes.body as { id: string }).id;

    const seatsRes = await request(server)
      .get(`/api/trips/${tripId}/seats`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const available = (
      seatsRes.body as {
        seats: Array<{ id: string; status: string; price: string }>;
      }
    ).seats.filter((s) => s.status === 'AVAILABLE');
    expect(available.length).toBeGreaterThan(0);
    // المقعد المتنازع عليه: الأول — كل المشترون يحاولون نفس المقعد
    seatId = available[0].id;
    seatPrice = Number(available[0].price);
  }, 120_000);

  async function createAdditionalTrip(
    label: string,
    departureOffsetHours: number,
  ): Promise<{ tripId: string; seatId: string }> {
    const busRes = await request(server)
      .post('/api/buses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        plateNumber: `TN-${label}-${Date.now() % 100000}`,
        seatTemplateId: templateId,
      });
    expect(busRes.status).toBe(201);

    const departure = new Date(Date.now() + departureOffsetHours * 3_600_000);
    const tripRes = await request(server)
      .post('/api/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        routeId,
        busId: (busRes.body as { id: string }).id,
        departureAt: departure.toISOString(),
        arrivalAt: new Date(departure.getTime() + 5 * 3_600_000).toISOString(),
        price: 12_500,
      });
    expect(tripRes.status).toBe(201);
    const createdTripId = (tripRes.body as { id: string }).id;

    const seatsRes = await request(server)
      .get(`/api/trips/${createdTripId}/seats`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(seatsRes.status).toBe(200);
    const firstSeat = (
      seatsRes.body as { seats: Array<{ id: string; status: string }> }
    ).seats.find((seat) => seat.status === 'AVAILABLE');
    expect(firstSeat).toBeTruthy();
    return { tripId: createdTripId, seatId: firstSeat!.id };
  }

  afterAll(async () => {
    // نفس النمط الذرّي المعتمد (bd78b0c): معاملة واحدة — ENABLE داخلها.
    try {
      await admin.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            `ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_immutable_guard`,
          );
          await tx.$executeRawUnsafe(
            `ALTER TABLE journal_entry_lines DISABLE TRIGGER journal_entry_lines_immutability_guard`,
          );
          await tx.$executeRawUnsafe(
            `ALTER TABLE journal_entries DISABLE TRIGGER journal_entries_posting_guard`,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM audit_logs WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM accounting_events WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM journal_entry_lines WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM journal_entries WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM accounting_policies WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM fiscal_periods WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM journals WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM accounts WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM refunds WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM payments WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM commissions WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM tickets WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM bookings WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM idempotency_records WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM trip_seats WHERE "tripId" IN (SELECT id FROM trips WHERE "organizationId" = $1)`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM trips WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM route_stops WHERE "routeId" IN (SELECT id FROM routes WHERE "organizationId" = $1)`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM routes WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM buses WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM seat_templates WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM subscriptions WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM users WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM roles WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM branches WHERE "organizationId" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM organizations WHERE "id" = $1`,
            orgId,
          );
          await tx.$executeRawUnsafe(
            `ALTER TABLE journal_entries ENABLE TRIGGER journal_entries_posting_guard`,
          );
          await tx.$executeRawUnsafe(
            `ALTER TABLE journal_entry_lines ENABLE TRIGGER journal_entry_lines_immutability_guard`,
          );
          await tx.$executeRawUnsafe(
            `ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_immutable_guard`,
          );
        },
        { timeout: 90_000 },
      );
    } catch {
      // انهارت → رُجعت كاملة — الحارسات سليمة (ضمانة الذرّية).
    } finally {
      await admin.$disconnect();
      await app.close();
    }
  }, 120_000);

  it('exactly ONE of N concurrent buyers wins; the rest fail cleanly; no double anything', async () => {
    // ── الهجوم: N طلب متوازٍ حقيقي لنفس المقعد ─────────────────────
    // كل مشترٍ: مستخدم بائع نفسه لكن مفتاح idempotency مختلف (لا
    // يخفف idempotency السباق — هو لأشعة مختلفة تمامًا).
    const attempts = Array.from({ length: CONCURRENT_BUYERS }, (_, i) =>
      request(server)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${sellerToken}`)
        .set('Idempotency-Key', `seat-race-${slug}-${i}`)
        .send({
          tripId,
          seatIds: [seatId],
          passengerName: `مسافر السباق ${i}`,
          passengerPhone: `09100000${i}`,
          paymentMethod: 'CASH',
        }),
    );
    const responses = await Promise.all(attempts);

    // ① نجاح واحد بالضبط
    const winners = responses.filter((r) => r.status === 201);
    expect(winners.length).toBe(1); // واحد بالضبط

    // ② الباقون فشلوا فشلًا صحيحًا — 409 (المقعد مأخوذ)، لا 500
    const losers = responses.filter((r) => r.status !== 201);
    expect(losers.length).toBe(CONCURRENT_BUYERS - 1);
    for (const loser of losers) {
      expect([409, 404]).toContain(loser.status); // 409 المقعد الطبيعي؛ 404 احتياط رحلة/وكيل
      expect(loser.status).not.toBe(500); // لا خطأ خادم — فشل أعمال نظيف
    }

    // ③ لا حجز مزدوج على مستوى القاعدة
    const bookings = await admin.booking.findMany({
      where: { tripId, organizationId: orgId },
    });
    expect(bookings.length).toBe(1);
    expect(Number(bookings[0].totalAmount)).toBe(seatPrice);

    const tickets = await admin.ticket.findMany({
      where: { tripId, organizationId: orgId },
    });
    expect(tickets.length).toBe(1);

    const payments = await admin.payment.findMany({
      where: { organizationId: orgId },
    });
    expect(payments.length).toBe(1);
    expect(Number(payments[0].amount)).toBe(seatPrice);

    // ④ حدث محاسبي واحد بالضبط (لا enqueue مزدوج من السباق)
    const events = await admin.accountingEvent.findMany({
      where: { organizationId: orgId, eventType: 'PAYMENT_RECEIVED' },
    });
    expect(events.length).toBe(1);

    // ⑤ الحالة النهائية للمقعد: BOOKED مربوط بالتذكرة الوحيدة
    const seat = await admin.tripSeat.findUniqueOrThrow({
      where: { id: seatId },
    });
    expect(seat.status).toBe('BOOKED');
    expect(seat.ticketId).toBe(tickets[0].id);

    // ⑥ العامل يرحّل الحدث الوحيد مرة واحدة — قيد متوازن واحد
    const worker = app.get(AccountingEventWorker);
    for (let i = 0; i < 200 && events[0]; i++) {
      const fresh = await admin.accountingEvent.findUnique({
        where: { id: events[0].id },
      });
      if (fresh?.status === 'POSTED') break;
      const did = await worker.runOnce();
      if (!did) break; // لا مزيد من العمل
    }
    const final = await admin.accountingEvent.findUniqueOrThrow({
      where: { id: events[0].id },
      include: { journalEntry: { include: { lines: true } } },
    });
    expect(final.status).toBe('POSTED');

    const journalEntries = await admin.journalEntry.findMany({
      where: { organizationId: orgId, status: 'POSTED' },
    });
    expect(journalEntries.length).toBe(1); // لا قيد مزدوج

    const lines = final.journalEntry!.lines;
    const sumDebit = lines.reduce((a, l) => a + Number(l.debit), 0);
    const sumCredit = lines.reduce((a, l) => a + Number(l.credit), 0);
    expect(sumDebit).toBeCloseTo(seatPrice, 2);
    expect(sumCredit).toBeCloseTo(seatPrice, 2);
  }, 120_000);

  it('allocates distinct organization ticket numbers for simultaneous sales on different trips', async () => {
    const [first, second] = await Promise.all([
      createAdditionalTrip('a', 72),
      createAdditionalTrip('b', 96),
    ]);

    const responses = await Promise.all(
      [first, second].map((target, index) =>
        request(server)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${sellerToken}`)
          .set('Idempotency-Key', `ticket-number-race-${slug}-${index}`)
          .send({
            tripId: target.tripId,
            seatIds: [target.seatId],
            passengerName: `مسافر ترقيم ${index}`,
            passengerPhone: `09200000${index}`,
            paymentMethod: 'CASH',
          }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const numbers = responses.map(
      (response) =>
        (response.body as { tickets: Array<{ number: string }> }).tickets[0]
          .number,
    );
    expect(new Set(numbers).size).toBe(2);

    const persisted = await admin.ticket.findMany({
      where: {
        organizationId: orgId,
        tripId: { in: [first.tripId, second.tripId] },
      },
      select: { number: true },
    });
    expect(persisted).toHaveLength(2);
    expect(new Set(persisted.map((ticket) => ticket.number)).size).toBe(2);
  }, 120_000);
});
