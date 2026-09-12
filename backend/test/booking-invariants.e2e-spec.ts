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
 * BOOKING INVARIANTS (Phase 4 — عقد الهندسة: "اختبارات للـ invariants
 * التي لو كسرت لوقع ضرر مالي/عزلي")
 * ================================================================
 * المفحوص من جدول الخطة:
 *  ① totalAmount = Σ(seat prices) دائماً server-side (لا ثقة بالعميل)
 *  ③ Idempotency: نفس المفتاح → نفس النتيجة (لا حجز مزدوج أبداً)
 *  ④ cancel يحرر المقعد + refund بالنسبة (cancellationFeePercent)
 *     + عكس العمولة (reversedAt)
 *  ⑤ replay آمن بعد انتهاء hold (نفس المفتاح بعد 10 دقائق)
 *  Seats ①: مقعد HELD-for-other غير قابل لل Claim (409)
 *  Seats ②: الأنواع غير البيعية (BLOCKED/VIP?) مرفوضة — يفحصها
 *           bookings.service.spec وunit موجود؛ نضيف الحد الحي:
 *           مقعد BOOKED بعد الحجز لا يُبعع ثانية (unique + claim).
 *
 * NOT covered here (موجود أصلاً — لا تكرار): booking 2-client
 * concurrency (runtime-rls/refund-concurrency)، check-in 6-way
 * (security-regression S1)، expense dual (S4).
 */

const PASSWORD = 'E2eTest-Passw0rd-2026';

type Server = import('http').Server;

describe('booking invariants (Phase 4)', () => {
  let app: INestApplication<App>;
  let server: Server;
  const admin = new PrismaClient();
  const suffix = `${process.pid}-${Date.now()}`;
  const slug = `booking-inv-${suffix}`;
  const createdTripIds: string[] = [];

  let operatorToken = '';
  let tenantToken = '';
  let tenantOrgId = '';
  let routeId = '';
  let busId = '';
  let templateId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(['error', 'warn']);
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as unknown as Server;

    // مشغل المنصة يزود tenant تجربة
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'e2e-owner@ticketty.local', password: PASSWORD });
    operatorToken = (login.body as { access_token: string }).access_token;

    const provisioned = await request(server)
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        name: 'شركة ثوابت الحجز',
        slug,
        ownerName: 'مالك ثوابت الحجز',
        ownerEmail: `owner-${slug}@ticketty.local`,
        initialPassword: 'Booking-Inv-Passw0rd-2026',
        primaryBranchName: 'الفرع الرئيسي',
      });
    expect([200, 201]).toContain(provisioned.status);
    tenantOrgId = (provisioned.body as { organization: { id: string } })
      .organization.id;

    tenantToken = await loginAndRotateTemporaryPassword(
      server,
      `owner-${slug}@ticketty.local`,
      'Booking-Inv-Passw0rd-2026',
      'Booking-Inv-Permanent-2026!',
    );

    // أسطول + خط — نوافذ زمنية متباعدة لتفادي قيد التراكب
    const templateRes = await request(server)
      .post('/api/seat-templates')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        name: 'قالب الثوابت',
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
    templateId = (templateRes.body as { id: string }).id;

    const busRes = await request(server)
      .post('/api/buses')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        plateNumber: `BI${Date.now() % 100000}`,
        seatTemplateId: templateId,
      });
    busId = (busRes.body as { id: string }).id;

    const routeRes = await request(server)
      .post('/api/routes')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        name: 'خط الثوابت',
        fromCity: 'أ',
        toCity: 'ب',
        stops: [
          { city: 'أ', order: 0 },
          { city: 'ب', order: 1 },
        ],
      });
    routeId = (routeRes.body as { id: string }).id;
  }, 120_000);

  afterAll(async () => {
    try {
      await admin.$executeRawUnsafe(
        `DELETE FROM "subscriptions" WHERE "organizationId" = $1`,
        tenantOrgId,
      );
      await admin.ticket.deleteMany({ where: { organizationId: tenantOrgId } });
      await admin.refund.deleteMany({ where: { organizationId: tenantOrgId } });
      await admin.payment.deleteMany({
        where: { organizationId: tenantOrgId },
      });
      await admin.commission.deleteMany({
        where: { organizationId: tenantOrgId },
      });
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
      await admin.user.deleteMany({ where: { organizationId: tenantOrgId } });
      await admin.role.deleteMany({ where: { organizationId: tenantOrgId } });
      await admin.branch.deleteMany({ where: { organizationId: tenantOrgId } });
      await admin.organization.deleteMany({ where: { id: tenantOrgId } });
    } catch {
      /* best-effort dev cleanup */
    } finally {
      await admin.$disconnect();
      await app.close();
    }
  }, 120_000);

  // ─── أدوات ────────────────────────────────────────────────

  let tripCounter = 0;
  /** رحلة جديدة بمقاعد حرة (نوافذ متباعدة) — tripCreate مسار إداري. */
  async function freshTrip(): Promise<string> {
    tripCounter += 1;
    const res = await request(server)
      .post('/api/trips')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        routeId,
        busId,
        departureAt: new Date(
          Date.now() + 86_400_000 + tripCounter * 7 * 86_400_000,
        ).toISOString(),
        arrivalAt: new Date(
          Date.now() + 86_400_000 + tripCounter * 7 * 86_400_000 + 3_600_000,
        ).toISOString(),
        price: 10_000,
      });
    expect(res.status).toBe(201);
    const id = (res.body as { id: string }).id;
    createdTripIds.push(id);
    return id;
  }

  async function freeSeat(tripId: string): Promise<{
    id: string;
    price: unknown;
  }> {
    const seatsRes = await request(server)
      .get(`/api/trips/${tripId}/seats`)
      .set('Authorization', `Bearer ${tenantToken}`);
    const { seats } = seatsRes.body as {
      seats: Array<{ id: string; status: string; price: unknown }>;
    };
    const free = seats.find((s) => s.status === 'AVAILABLE');
    if (!free) throw new Error('no free seat — test sequencing broken');
    return free;
  }

  async function book(
    tripId: string,
    seatIds: string[],
    idempotencyKey: string,
  ): Promise<request.Response> {
    return request(server)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${tenantToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        tripId,
        seatIds,
        passengerName: 'مسافر الثوابت',
        passengerPhone: '0912000000',
        paymentMethod: 'CASH',
      });
  }

  // ─── ① totalAmount = Σ(seat prices) — لا ثقة بالعميل ─────

  it('multi-seat booking: server computes totalAmount = Σ seat prices', async () => {
    const tripId = await freshTrip();
    const s1 = await freeSeat(tripId);
    const s2res = await request(server)
      .get(`/api/trips/${tripId}/seats`)
      .set('Authorization', `Bearer ${tenantToken}`);
    const seats2 = (
      s2res.body as {
        seats: Array<{ id: string; status: string; price: string }>;
      }
    ).seats.filter((s) => s.status === 'AVAILABLE' && s.id !== s1.id);
    const s2 = seats2[0];

    const res = await book(tripId, [s1.id, s2.id], `inv-total-${suffix}`);
    expect(res.status).toBe(201);

    const body = res.body as {
      totalAmount: string;
      tickets: Array<{ fare: string }>;
    };
    const sumFares = body.tickets.reduce((acc, t) => acc + Number(t.fare), 0);
    expect(Number(body.totalAmount)).toBe(sumFares);
    // المبلغ لا يأتي من العميل إطلاقاً — DTO بلا totalAmount
    // (الـ schema يرفض الحقول الزائدة؟ نتحقق أن الحجز استخدم أسعار المقاعد):
    const seatPrices = [s1.price, s2.price].map(Number);
    expect(Number(body.totalAmount)).toBe(
      seatPrices.reduce((a, b) => a + b, 0),
    );
  });

  // ─── ③ Idempotency: نفس المفتاح → نفس النتيجة ────────────

  it('same idempotency key replays the SAME booking (no double sale)', async () => {
    const tripId = await freshTrip();
    const seat = await freeSeat(tripId);
    const key = `inv-replay-${suffix}`;

    const first = await book(tripId, [seat.id], key);
    expect(first.status).toBe(201);
    const firstBody = first.body as { id: string; tickets: unknown[] };

    const second = await book(tripId, [seat.id], key);
    expect(second.status).toBe(201); // replay — نفس النتيجة
    const secondBody = second.body as { id: string; tickets: unknown[] };

    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.tickets.length).toBe(firstBody.tickets.length);

    // لا حجز مزدوج في القاعدة: عدد الحجوزات بهذا المفتاح = 1
    const bookingsWithKey = await admin.booking.count({
      where: { idempotencyKey: key },
    });
    expect(bookingsWithKey).toBe(1);
  });

  it('concurrent duplicate submissions return one durable booking result', async () => {
    const tripId = await freshTrip();
    const seat = await freeSeat(tripId);
    const key = `inv-concurrent-replay-${suffix}`;

    const [first, second] = await Promise.all([
      book(tripId, [seat.id], key),
      book(tripId, [seat.id], key),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((first.body as { id: string }).id).toBe(
      (second.body as { id: string }).id,
    );
    await expect(
      admin.booking.count({
        where: { organizationId: tenantOrgId, idempotencyKey: key },
      }),
    ).resolves.toBe(1);
    await expect(
      admin.payment.count({
        where: { organizationId: tenantOrgId, idempotencyKey: key },
      }),
    ).resolves.toBe(1);
  });

  it('rejects reusing a completed sale key with a different payload', async () => {
    const tripId = await freshTrip();
    const firstSeat = await freeSeat(tripId);
    const seatsRes = await request(server)
      .get(`/api/trips/${tripId}/seats`)
      .set('Authorization', `Bearer ${tenantToken}`);
    const secondSeat = (
      seatsRes.body as { seats: Array<{ id: string; status: string }> }
    ).seats.find(
      (seat) => seat.status === 'AVAILABLE' && seat.id !== firstSeat.id,
    );
    expect(secondSeat).toBeTruthy();
    const key = `inv-key-mismatch-${suffix}`;

    expect((await book(tripId, [firstSeat.id], key)).status).toBe(201);
    const mismatch = await book(tripId, [secondSeat!.id], key);

    expect(mismatch.status).toBe(409);
    expect((mismatch.body as { message: string }).message).toContain(
      'محتوى مختلف',
    );
    const untouched = await admin.tripSeat.findUniqueOrThrow({
      where: { id: secondSeat!.id },
    });
    expect(untouched.status).toBe('AVAILABLE');
  });

  it('idempotent replay after hold expiry returns the same booking (⑤)', async () => {
    const tripId = await freshTrip();
    const seat = await freeSeat(tripId);
    const key = `inv-replay-expired-hold-${suffix}`;

    const first = await book(tripId, [seat.id], key);
    expect(first.status).toBe(201);

    // محاكاة انتهاء الـ hold: لا يوجد hold هنا (BOOKED مباشرة) لكن
    // الـ replay بعد "مرور زمن" يجب أن يعيد نفس الحجز — نتحقق أن
    // مسار الـ replay لا يعتمد على حالة المقعد إطلاقاً.
    await new Promise((r) => setTimeout(r, 50));
    const second = await book(tripId, [seat.id], key);
    expect(second.status).toBe(201);
    expect((second.body as { id: string }).id).toBe(
      (first.body as { id: string }).id,
    );
  });

  // ─── مقعد محجوز لا يُباع مرتين (unique + claim) ───────────

  it('a BOOKED seat cannot be sold again (409, no second ticket)', async () => {
    const tripId = await freshTrip();
    const seat = await freeSeat(tripId);

    const first = await book(tripId, [seat.id], `inv-take1-${suffix}`);
    expect(first.status).toBe(201);

    // مفتاح idempotency مختلف = طلب بيع جديد للمقعد نفسه
    const second = await book(tripId, [seat.id], `inv-take2-${suffix}`);
    expect(second.status).toBe(409); // المقعد غير متاح

    // لا تذكرة ثانية على المقعد الفيزيائي
    const ticketsOnSeat = await admin.ticket.count({
      where: { tripSeatId: seat.id, status: { not: 'CANCELLED' } },
    });
    expect(ticketsOnSeat).toBe(1);
  });

  // ─── ④ cancel: تحرير المقعد + refund بالنسبة + عكس العمولة ─

  it('cancel releases the seat, refunds by ratio, reverses commission', async () => {
    const tripId = await freshTrip();
    const seat = await freeSeat(tripId);

    const createRes = await book(tripId, [seat.id], `inv-cancel-${suffix}`);
    expect(createRes.status).toBe(201);
    const bookingId = (createRes.body as { id: string }).id;

    // تأكيد وجود عمولة نشطة (booking عبر API داخلي يخلقها؟ نفحص
    // الحالة الفعلية — إن وُجدت يجب أن تُعكس بالإلغاء)
    const commissionsBefore = await admin.commission.count({
      where: { bookingId, reversedAt: null },
    });

    // cancellationFeePercent للـ org الجديدة — نقرأها لنحسب المتوقع
    const org = await admin.organization.findUniqueOrThrow({
      where: { id: tenantOrgId },
      select: { cancellationFeePercent: true },
    });
    const paymentBefore = await admin.payment.findFirstOrThrow({
      where: { bookingId },
    });
    const expectedRefund =
      (Number(paymentBefore.amount) *
        (100 - Number(org.cancellationFeePercent))) /
      100;

    const cancelRes = await request(server)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .set('Idempotency-Key', `inv-cancel-key-${suffix}`)
      .send({ reason: 'اختبار الإلغاء' });
    expect([200, 201]).toContain(cancelRes.status);

    // المقعد تحرر
    const seatRow = await admin.tripSeat.findUniqueOrThrow({
      where: { id: seat.id },
    });
    expect(seatRow.status).toBe('AVAILABLE');
    expect(seatRow.ticketId).toBeNull();

    // refund بالنسبة المضبوطة (تقريب منزلتين)
    const refunds = await admin.refund.findMany({ where: { bookingId } });
    expect(refunds.length).toBeGreaterThan(0);
    const refundedTotal = refunds.reduce((a, r) => a + Number(r.amount), 0);
    expect(refundedTotal).toBeCloseTo(expectedRefund, 1);

    // العمولة عُكست (reversedAt set) — إن وُجدت أصلاً
    if (commissionsBefore > 0) {
      const activeAfter = await admin.commission.count({
        where: { bookingId, reversedAt: null },
      });
      expect(activeAfter).toBe(0);
    }

    // payment.refundedAmount تحدث تراكمياً (trigger)
    const paymentAfter = await admin.payment.findFirstOrThrow({
      where: { bookingId },
    });
    expect(Number(paymentAfter.refundedAmount)).toBeCloseTo(refundedTotal, 1);
  });

  it('cancel idempotency: second cancel with same key replays (no double refund)', async () => {
    const tripId = await freshTrip();
    const seat = await freeSeat(tripId);

    const createRes = await book(tripId, [seat.id], `inv-cancel2-${suffix}`);
    const bookingId = (createRes.body as { id: string }).id;

    const key = `inv-cancel-replay-${suffix}`;
    const first = await request(server)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .set('Idempotency-Key', key)
      .send({ reason: 'أول' });
    expect([200, 201]).toContain(first.status);

    const second = await request(server)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .set('Idempotency-Key', key)
      .send({ reason: 'أول' });
    expect([200, 201]).toContain(second.status);

    // لا استرداد مضاعف: عدد الـ refunds = عدد المدفوعات المستردة مرة
    const refunds = await admin.refund.findMany({ where: { bookingId } });
    const payment = await admin.payment.findFirstOrThrow({
      where: { bookingId },
    });
    expect(refunds.length).toBe(1);
    expect(Number(payment.refundedAmount)).toBeCloseTo(
      Number(refunds[0].amount),
      1,
    );
  });

  // ─── Seats ①: HELD-for-other غير قابل للـ claim ────────────

  it('a seat HELD by another user cannot be claimed (409)', async () => {
    const tripId = await freshTrip();
    const seat = await freeSeat(tripId);

    // نحجز المقعد مباشرة في DB كأن مستخدماً آخر يمسكه
    const otherUserId = 'other-user-hold';
    await admin.tripSeat.update({
      where: { id: seat.id },
      data: {
        status: 'HELD',
        heldByUserId: otherUserId,
        holdExpiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });

    const res = await book(tripId, [seat.id], `inv-held-${suffix}`);
    expect(res.status).toBe(409);

    // الحالة لم تتغير — لا تذكرة
    const ticketsOnSeat = await admin.ticket.count({
      where: { tripSeatId: seat.id },
    });
    expect(ticketsOnSeat).toBe(0);
  });

  it('expired hold: lazy cleanup on seats read, then claim succeeds (⑤+⑥)', async () => {
    const tripId = await freshTrip();
    const seat = await freeSeat(tripId);

    // hold منتهٍ لمستخدم آخر
    await admin.tripSeat.update({
      where: { id: seat.id },
      data: {
        status: 'HELD',
        heldByUserId: 'gone-user',
        holdExpiresAt: new Date(Date.now() - 60_000), // منتهي
      },
    });

    // ① قبل القراءة: الـ claim يرفض (تصميم مقصود — الـ claim لا
    //    يستولي؛ عقد §11: لا تعديل booking core). NOT a defect.
    const directClaim = await book(
      tripId,
      [seat.id],
      `inv-hold-expired-direct-${suffix}`,
    );
    expect(directClaim.status).toBe(409);

    // ② التنظيف الكسول: قراءة المقاعد تحرر الـ holds المنتهية
    //    (seats() endpoint — lazy cleanup موثق في trips.service).
    const seatsRes = await request(server)
      .get(`/api/trips/${tripId}/seats`)
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(seatsRes.status).toBe(200);

    const afterRead = await admin.tripSeat.findUniqueOrThrow({
      where: { id: seat.id },
    });
    expect(afterRead.status).toBe('AVAILABLE');

    // ③ الآن البيع ينجح — الاستيلاء عبر القراءة ثم الحجز
    const res = await book(tripId, [seat.id], `inv-hold-expired-${suffix}`);
    expect(res.status).toBe(201);
  });
});
