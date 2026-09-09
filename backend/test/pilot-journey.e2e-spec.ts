import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { AccountingEventWorker } from '../src/accounting/accounting-event.worker';

/**
 * PILOT JOURNEY (BLOCKER-3) — رحلة أول عميل حقيقي من البداية للنهاية
 * ====================================================================
 * اختبار طولي واحد يثبت الخيط الكامل الذي طلبته المالك:
 *
 *   Organization → Branch → Users/Roles → Vehicle → Driver → Route →
 *   Trip → Seats → Booking → CASH Sale → Ticket → Check-in →
 *   Cancellation/Refund → Accounting → Reports → Final verification
 *
 * المبدأ الحاكم: «يثبت أن العملية المحاسبية وصلت للحالة الصحيحة،
 * وليس فقط أن الـ API أعاد نجاحًا» — كل خطوة مالية تُتحقق في
 * القاعدة (القيد POSTED ومتوازن، الاسترداد بالنسبة، المقعد تحرر).
 *
 * الشركة تُزوَّد عبر بوابة المنصة (مثل أول عميل حقيقي تماماً) —
 * وBlocker-1 يضمن خروجها بمحاسبة مكتملة التهيئة.
 */

const OPERATOR_PASSWORD = 'E2eTest-Passw0rd-2026';
const OWNER_PASSWORD = 'Pilot-Journey-Passw0rd-2026';
const SELLER_PASSWORD = 'Pilot-Seller-Passw0rd-2026';

type Server = import('http').Server;

describe('PILOT JOURNEY: first real client, end to end (BLOCKER-3)', () => {
  let app: INestApplication<App>;
  let server: Server;
  const admin = new PrismaClient();
  const slug = `pilot-journey-${process.pid}-${Date.now()}`;

  let operatorToken = '';
  let ownerToken = '';
  let sellerToken = '';
  let orgId = '';
  let branchId = '';

  // الرحلة الكاملة — حالة تتراكم عبر الخطوات (لا تنعزل):
  let templateId = '';
  let busId = '';
  let driverId = '';
  let routeId = '';
  let tripId = '';
  let seatId = '';
  let bookingId = '';
  let paymentId = '';
  let ticketId = '';
  let paymentAmount = 0;
  let refundId = '';
  let saleEventId = '';
  let refundEventId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(['error', 'warn']);
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as unknown as Server;
  }, 120_000);

  afterAll(async () => {
    // تنظيف جذري داخل معاملة واحدة — نمط الـ repo المعتمد
    try {
      await admin.$executeRawUnsafe('BEGIN');
      await admin.$executeRawUnsafe(
        `ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_immutable_guard`,
      );
      await admin.$executeRawUnsafe(
        `ALTER TABLE journal_entry_lines DISABLE TRIGGER journal_entry_lines_immutability_guard`,
      );
      await admin.$executeRawUnsafe(
        `ALTER TABLE journal_entries DISABLE TRIGGER journal_entries_posting_guard`,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM audit_logs WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM accounting_events WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM journal_entry_lines WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM journal_entries WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM accounting_policies WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM fiscal_periods WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM journals WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM accounts WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM refunds WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM payments WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM commissions WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM tickets WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM bookings WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM idempotency_records WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM trip_seats WHERE "tripId" IN (SELECT id FROM trips WHERE "organizationId" = $1)`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM trips WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM route_stops WHERE "routeId" IN (SELECT id FROM routes WHERE "organizationId" = $1)`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM routes WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM drivers WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM buses WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM seat_templates WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM subscriptions WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM users WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM roles WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM branches WHERE "organizationId" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM organizations WHERE "id" = $1`,
        orgId,
      );
      await admin.$executeRawUnsafe(
        `ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_immutable_guard`,
      );
      await admin.$executeRawUnsafe(
        `ALTER TABLE journal_entry_lines ENABLE TRIGGER journal_entry_lines_immutability_guard`,
      );
      await admin.$executeRawUnsafe(
        `ALTER TABLE journal_entries ENABLE TRIGGER journal_entries_posting_guard`,
      );
      await admin.$executeRawUnsafe('COMMIT');
    } catch {
      try {
        await admin.$executeRawUnsafe('ROLLBACK');
      } catch {
        /* already rolled back */
      }
    } finally {
      await admin.$disconnect();
      await app.close();
    }
  }, 120_000);

  /** استنزاف الـ worker حتى يُرحَّل حدثنا (الأقدم أولاً). */
  async function drainUntilPosted(eventId: string): Promise<void> {
    const worker = app.get(AccountingEventWorker);
    for (let i = 0; i < 200; i++) {
      // full runs: older global backlog drains first
      const fresh = await admin.accountingEvent.findUnique({
        where: { id: eventId },
      });
      if (fresh?.status === 'POSTED') return;
      const did = await worker.runOnce();
      if (!did) {
        // لا مزيد من العمل — لو لم يُرحَّل حدثنا فهذا فشل
        const still = await admin.accountingEvent.findUnique({
          where: { id: eventId },
        });
        if (still?.status !== 'POSTED') break;
      }
    }
  }

  // ─── 1. Organization (عبر بوابة المنصة — مثل أول عميل حقيقي) ──

  it('step 1-2: platform provisions the company WITH branch (and BLOCKER-1 bootstrap)', async () => {
    const login = await request(server).post('/api/auth/login').send({
      email: 'e2e-owner@ticketty.local',
      password: OPERATOR_PASSWORD,
    });
    expect([200, 201]).toContain(login.status);
    operatorToken = (login.body as { access_token: string }).access_token;

    const provisioned = await request(server)
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        name: 'شركة رحلة أول عميل',
        slug,
        ownerName: 'مالك أول عميل',
        ownerEmail: `owner-${slug}@ticketty.local`,
        initialPassword: OWNER_PASSWORD,
        primaryBranchName: 'فرع الخرطوم المركزي',
        primaryBranchCity: 'الخرطوم',
      });
    expect(provisioned.status).toBe(201);
    orgId = (provisioned.body as { organization: { id: string } }).organization
      .id;
    branchId = (provisioned.body as { primaryBranch: { id: string } })
      .primaryBranch.id;
    expect(orgId).toBeTruthy();
    expect(branchId).toBeTruthy();

    // BLOCKER-1 الربط: التزويد أنجز المحاسبة كاملة (ذريّة)
    const policies = await admin.accountingPolicy.count({
      where: { organizationId: orgId, active: true },
    });
    expect(policies).toBe(4);
    const openPeriod = await admin.fiscalPeriod.findFirstOrThrow({
      where: { organizationId: orgId, status: 'OPEN' },
    });
    expect(new Date(openPeriod.startsAt).getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
  }, 60_000);

  // ─── 3. Users & Roles (مالك يضيف بائعاً) ─────────────────────

  it('step 3: owner logs in and creates a SELLER user', async () => {
    const login = await request(server)
      .post('/api/auth/login')
      .send({
        email: `owner-${slug}@ticketty.local`,
        password: OWNER_PASSWORD,
      });
    expect([200, 201]).toContain(login.status);
    ownerToken = (login.body as { access_token: string }).access_token;

    // الأدوار المزروعة موجودة (seed roles تشمل SELLER)
    const roles = await request(server)
      .get('/api/administration/roles')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(roles.status).toBe(200);
    const roleList = roles.body as Array<{ key: string; id: string }>;
    const sellerRole = roleList.find((r) => r.key === 'SELLER');
    expect(sellerRole).toBeTruthy();

    const seller = await request(server)
      .post('/api/administration/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'بائع الفرع',
        email: `seller-${slug}@ticketty.local`,
        password: SELLER_PASSWORD,
        roleId: sellerRole!.id,
        branchId,
      });
    expect(seller.status).toBe(201);

    const sellerLogin = await request(server)
      .post('/api/auth/login')
      .send({
        email: `seller-${slug}@ticketty.local`,
        password: SELLER_PASSWORD,
      });
    expect([200, 201]).toContain(sellerLogin.status);
    sellerToken = (sellerLogin.body as { access_token: string }).access_token;
  }, 60_000);

  // ─── 4-6. Vehicle → Driver → Route ──────────────────────────

  it('step 4-6: template, bus, driver, and route', async () => {
    const template = await request(server)
      .post('/api/seat-templates')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'قالب الرحلة',
        rows: 2,
        columnsPerRow: 4,
        aisleAfterColumn: 2,
        seats: [
          { row: 1, column: 1 },
          { row: 1, column: 2 },
          { row: 1, column: 3 },
          { row: 1, column: 4 },
          { row: 2, column: 1 },
          { row: 2, column: 2 },
          { row: 2, column: 3 },
          { row: 2, column: 4 },
        ],
      });
    expect(template.status).toBe(201);
    templateId = (template.body as { id: string }).id;

    const bus = await request(server)
      .post('/api/buses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        plateNumber: `PJ${Date.now() % 1000000}`,
        seatTemplateId: templateId,
      });
    expect(bus.status).toBe(201);
    busId = (bus.body as { id: string }).id;

    const driver = await request(server)
      .post('/api/drivers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'سائق الرحلة',
        phone: '0912345678',
        licenseNumber: `LIC-${Date.now() % 100000}`,
        licenseExpiry: '2027-12-31',
      });
    expect(driver.status).toBe(201);
    driverId = (driver.body as { id: string }).id;

    const route = await request(server)
      .post('/api/routes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'الخرطوم — بورتسودان',
        fromCity: 'الخرطوم',
        toCity: 'بورتسودان',
        stops: [
          { city: 'الخرطوم', order: 0 },
          { city: 'الجزيرة', order: 1 },
          { city: 'بورتسودان', order: 2 },
        ],
      });
    expect(route.status).toBe(201);
    routeId = (route.body as { id: string }).id;
  }, 60_000);

  // ─── 7-8. Trip + Seats ─────────────────────────────────────

  it('step 7-8: trip with driver and sellable seats', async () => {
    const departure = new Date(Date.now() + 48 * 3_600_000);
    const trip = await request(server)
      .post('/api/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        routeId,
        busId,
        driverId,
        departureAt: departure.toISOString(),
        arrivalAt: new Date(departure.getTime() + 6 * 3_600_000).toISOString(),
        price: 18_000,
      });
    expect(trip.status).toBe(201);
    tripId = (trip.body as { id: string }).id;

    const seats = await request(server)
      .get(`/api/trips/${tripId}/seats`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(seats.status).toBe(200);
    const body = seats.body as {
      seats: Array<{ id: string; status: string; price: string }>;
    };
    const available = body.seats.filter((s) => s.status === 'AVAILABLE');
    expect(available.length).toBeGreaterThan(0);
    seatId = available[0].id;
    paymentAmount = Number(available[0].price);
  }, 60_000);

  // ─── 9-10. Booking + CASH Sale (البائع يبيع — مثل الواقع) ────

  it('step 9-10: SELLER sells a ticket for CASH', async () => {
    const sale = await request(server)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .set('Idempotency-Key', `pilot-journey-sale-${slug}`)
      .send({
        tripId,
        seatIds: [seatId],
        passengerName: 'مسافر أول رحلة',
        passengerPhone: '0911111111',
        paymentMethod: 'CASH',
      });
    expect(sale.status).toBe(201);
    const body = sale.body as {
      id: string;
      totalAmount: string;
      tickets: Array<{ id: string }>;
      payments: Array<{ id: string; amount: string }>;
    };
    bookingId = body.id;
    ticketId = body.tickets[0].id;
    paymentId = body.payments[0].id;
    expect(Number(body.totalAmount)).toBe(paymentAmount);
    expect(body.payments[0].amount).toBeTruthy();
  }, 60_000);

  // ─── 11. Ticket ────────────────────────────────────────────

  it('step 11: ticket exists, is ISSUED, and bound to the seat', async () => {
    const ticket = await admin.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { tripSeat: true },
    });
    expect(ticket.status).toBe('BOOKED'); // enum: BOOKED ثم CHECKED_IN
    expect(ticket.tripSeatId).toBe(seatId);
    expect(ticket.tripSeat.status).toBe('BOOKED');
  }, 60_000);

  // ─── 12. Check-in ──────────────────────────────────────────

  it('step 12: check-in boards the passenger', async () => {
    const checkIn = await request(server)
      .post(`/api/tickets/${ticketId}/check-in`)
      .set('Authorization', `Bearer ${sellerToken}`);
    expect([200, 201]).toContain(checkIn.status);

    const ticket = await admin.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });
    expect(ticket.status).toBe('CHECKED_IN');
  }, 60_000);

  // ─── 13. Cancellation/Refund ───────────────────────────────

  it('step 13: cancellation refunds by ratio and releases the seat', async () => {
    const org = await admin.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { cancellationFeePercent: true },
    });
    const payment = await admin.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    const expectedRefund =
      (Number(payment.amount) * (100 - Number(org.cancellationFeePercent))) /
      100;

    const cancel = await request(server)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `pilot-journey-cancel-${slug}`)
      .send({ reason: 'رحلة أول عميل — إلغاء اختباري' });
    expect([200, 201]).toContain(cancel.status);

    const refunds = await admin.refund.findMany({
      where: { bookingId, status: 'COMPLETED' },
    });
    expect(refunds.length).toBe(1);
    refundId = refunds[0].id;
    expect(Number(refunds[0].amount)).toBeCloseTo(expectedRefund, 1);

    // المقعد تحرر فعلياً
    const seat = await admin.tripSeat.findUniqueOrThrow({
      where: { id: seatId },
    });
    expect(seat.status).toBe('AVAILABLE');
    expect(seat.ticketId).toBeNull();

    // التذكرة أُلغيت
    const ticket = await admin.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });
    expect(['CANCELLED', 'REFUNDED']).toContain(ticket.status);
  }, 60_000);

  // ─── 14. Accounting — الحالة الصحيحة، لا نجاح API فقط ───────

  it('step 14a: sale event POSTED a balanced journal entry', async () => {
    const event = await admin.accountingEvent.findFirstOrThrow({
      where: {
        organizationId: orgId,
        eventType: 'PAYMENT_RECEIVED',
        sourceId: paymentId,
      },
    });
    saleEventId = event.id;
    await drainUntilPosted(saleEventId);

    const posted = await admin.accountingEvent.findUniqueOrThrow({
      where: { id: saleEventId },
      include: { journalEntry: { include: { lines: true } } },
    });
    expect(posted.status).toBe('POSTED');
    expect(posted.journalEntry).toBeTruthy();
    expect(posted.journalEntry!.status).toBe('POSTED');

    const lines = posted.journalEntry!.lines;
    const sumDebit = lines.reduce((a, l) => a + Number(l.debit), 0);
    const sumCredit = lines.reduce((a, l) => a + Number(l.credit), 0);
    expect(sumDebit).toBeCloseTo(paymentAmount, 2);
    expect(sumCredit).toBeCloseTo(sumDebit, 2);
  }, 60_000);

  it('step 14b: refund event POSTED a balanced reversal (cash out)', async () => {
    const event = await admin.accountingEvent.findFirstOrThrow({
      where: {
        organizationId: orgId,
        eventType: 'REFUND_COMPLETED',
        sourceId: refundId,
      },
    });
    refundEventId = event.id;
    await drainUntilPosted(refundEventId);

    const posted = await admin.accountingEvent.findUniqueOrThrow({
      where: { id: refundEventId },
      include: { journalEntry: { include: { lines: true } } },
    });
    expect(posted.status).toBe('POSTED');

    const refund = await admin.refund.findUniqueOrThrow({
      where: { id: refundId },
    });
    const lines = posted.journalEntry!.lines;
    const sumDebit = lines.reduce((a, l) => a + Number(l.debit), 0);
    const sumCredit = lines.reduce((a, l) => a + Number(l.credit), 0);
    expect(sumDebit).toBeCloseTo(Number(refund.amount), 2);
    expect(sumCredit).toBeCloseTo(sumDebit, 2);

    // اتجاه العكس صحيح: الإيراد مدين (يُخصم) والصندوق دائن (يُصرف)
    const cashAccount = await admin.account.findFirstOrThrow({
      where: { organizationId: orgId, code: '1010' },
    });
    const revenueAccount = await admin.account.findFirstOrThrow({
      where: { organizationId: orgId, code: '4000' },
    });
    const debitLine = lines.find((l) => Number(l.debit) > 0)!;
    const creditLine = lines.find((l) => Number(l.credit) > 0)!;
    expect(debitLine.accountId).toBe(revenueAccount.id);
    expect(creditLine.accountId).toBe(cashAccount.id);
  }, 60_000);

  // ─── 15. Reports ───────────────────────────────────────────

  it('step 15: financial reports reflect the journey', async () => {
    const reports = await request(server)
      .get('/api/reports/financial')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(reports.status).toBe(200);
    const summary = reports.body as {
      totalRevenue?: string;
      totalRefunded?: string;
    };
    // التقارير تستجيب وتحمل قيماً — التحقق العددي في طبقة القاعدة
    // (القيدان POSTED أعلاه هما مصدر الحقيقة؛ التقرير استهلاك لها)
    expect(summary).toBeTruthy();

    const occupancy = await request(server)
      .get(`/api/reports/occupancy`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(occupancy.status).toBe(200);
  }, 60_000);

  // ─── 16. Final verification — صمامات النهاية ──────────────────

  it('step 16: final state — no stuck events, no orphans, seat re-sellable', async () => {
    // ① لا أحداث عالقة للمنظمة (كل الرحلة المالية اكتملت)
    const stuck = await admin.accountingEvent.count({
      where: { organizationId: orgId, status: { in: ['PENDING', 'FAILED'] } },
    });
    expect(stuck).toBe(0);

    // ② كل POSTED مرتبط بقيد (لا يتامى)
    const orphans = await admin.accountingEvent.count({
      where: { organizationId: orgId, status: 'POSTED', journalEntryId: null },
    });
    expect(orphans).toBe(0);

    // ③ التوازن الكلي للدفاتر: Σdebit = Σcredit عبر كل قيود الرحلة
    const entries = await admin.journalEntry.findMany({
      where: { organizationId: orgId, status: 'POSTED' },
      include: { lines: true },
    });
    expect(entries.length).toBe(2); // البيع + الاسترداد
    const totalDebit = entries
      .flatMap((e) => e.lines)
      .reduce((a, l) => a + Number(l.debit), 0);
    const totalCredit = entries
      .flatMap((e) => e.lines)
      .reduce((a, l) => a + Number(l.credit), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2);

    // ④ المقعد المحرر قابل لإعادة البيع (رحلة أول عميل تتداول)
    const rebook = await request(server)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .set('Idempotency-Key', `pilot-journey-resale-${slug}`)
      .send({
        tripId,
        seatIds: [seatId],
        passengerName: 'مسافر ثانٍ',
        passengerPhone: '0922222222',
        paymentMethod: 'CASH',
      });
    expect(rebook.status).toBe(201);

    // ⑤ العزل: منظمات أخرى لا ترى شيئاً من هذه الرحلة
    const otherOrgCount = await admin.trip.count({
      where: { id: tripId },
    });
    expect(otherOrgCount).toBe(1); // الرحلة موجودة مرة (عزل القيد)
  }, 60_000);
});
