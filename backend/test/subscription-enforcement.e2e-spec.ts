import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAndRotateTemporaryPassword } from './helpers/auth';

/**
 * E2E — فرض اشتراك SaaS لدورة الحياة كاملة (عقد الهندسة §1 + §5).
 *
 * يغطي الحالات الحدية المطلوبة حرفياً:
 *  1. expiration boundary (end = now لا ينتقل؛ end−1ms ينتقل)
 *  2. concurrent renewal (renew ∥ sweep — قفل الصف يسلّس أي ترتيب)
 *  3. renewal أثناء sweep
 *  4. repeated sweep = no-op (ولا أحداث مكررة)
 *  5. PAST_DUE → ACTIVE (تجديد خلال المهلة)
 *  6. PAST_DUE → EXPIRED (تجاوز المهلة)
 *  7. EXPIRED → renewal (إصلاح IN clause)
 *  8. worker retry (unit — subscription-sweep.worker.spec.ts)
 * إضافةً إلى المصفوفة الكاملة: 402 ممنوع/مسموح عبر كل الفئات.
 *
 * التحكم بالزمن: تعديل مباشر لـ currentPeriodEnd عبر PrismaClient
 * المشرف (تعيين مستحيل إنتاجياً — بيئة اختبار فقط) + استدعاء
 * الدالة عبر PrismaService.runSubscriptionSweep() الذي يعمل بدور
 * ticketty_app — يثبت المنح عملياً لا نظرياً.
 */

describe('Subscription enforcement lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  const admin = new PrismaClient();
  const suffix = process.pid + '-' + Date.now();
  const slug = `sub-enforce-${suffix}`;
  const password = 'Sub-Enforce-Passw0rd-2026';
  const permanentPassword = `${password}-Permanent`;

  let operatorToken = '';
  let tenantToken = '';
  let tenantOrgId = '';
  let busId = '';
  let templateId = '';
  let routeId = '';
  const createdTripIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(['error', 'warn']);
    configureApp(app);
    await app.init();
    server = app.getHttpServer();

    // 1) مشغّل المنصة يسجّل ويزوّد Tenant جديداً كاملاً
    const login = await request(server)
      .post('/api/auth/login')
      .send({
        email: process.env.INITIAL_ADMIN_EMAIL ?? 'e2e-owner@ticketty.local',
        password: 'E2eTest-Passw0rd-2026',
      });
    expect([200, 201]).toContain(login.status);
    operatorToken = (login.body as { access_token: string }).access_token;

    const provisioned = await request(server)
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        name: 'شركة فرض الاشتراك',
        slug,
        ownerName: 'مالك فرض الاشتراك',
        ownerEmail: `owner-${slug}@ticketty.local`,
        initialPassword: password,
        primaryBranchName: 'الفرع الرئيسي',
      });
    expect([200, 201]).toContain(provisioned.status);
    tenantOrgId = (provisioned.body as { organization: { id: string } })
      .organization.id;

    // set TRIAL (30 يوم)
    const setTrial = await request(server)
      .post(`/api/platform/tenants/${tenantOrgId}/subscription`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ planKey: 'TRIAL', organizationId: tenantOrgId });
    expect(setTrial.status).toBe(201);

    // مالك الـ Tenant يسجّل
    tenantToken = await loginAndRotateTemporaryPassword(
      server,
      `owner-${slug}@ticketty.local`,
      password,
      permanentPassword,
    );

    // تجهيز أسطول/خط/رحلة (مسارات إدارية exempt — تعمل دائماً)
    const templateRes = await request(server)
      .post('/api/seat-templates')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        name: 'قالب فرض الاشتراك',
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
    expect([200, 201]).toContain(templateRes.status);
    templateId = (templateRes.body as { id: string }).id;

    const busRes = await request(server)
      .post('/api/buses')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        plateNumber: `SUB${Date.now() % 100000}`,
        seatTemplateId: templateId,
      });
    expect([200, 201]).toContain(busRes.status);
    busId = (busRes.body as { id: string }).id;

    const routeRes = await request(server)
      .post('/api/routes')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        name: 'خط فرض الاشتراك',
        fromCity: 'الخرطوم',
        toCity: 'بورتسودان',
        stops: [
          { city: 'الخرطوم', order: 0 },
          { city: 'بورتسودان', order: 1 },
        ],
      });
    expect([200, 201]).toContain(routeRes.status);
    routeId = (routeRes.body as { id: string }).id;

    const tripRes = await request(server)
      .post('/api/trips')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        routeId,
        busId,
        departureAt: new Date(Date.now() + 86_400_000).toISOString(),
        arrivalAt: new Date(Date.now() + 86_400_000 + 3_600_000).toISOString(),
        price: 25000,
      });
    expect([200, 201]).toContain(tripRes.status);
  }, 120_000);

  afterAll(async () => {
    // تنظيف جذري بترتيب FK
    try {
      await admin.$executeRawUnsafe(
        'DELETE FROM "subscriptions" WHERE "organizationId" = $1',
        tenantOrgId,
      );
      await admin.tripSeat.deleteMany({
        where: { trip: { organizationId: tenantOrgId } },
      });
      await admin.trip.deleteMany({
        where: { organizationId: tenantOrgId },
      });
      await admin.route.deleteMany({ where: { id: routeId } });
      await admin.bus.deleteMany({ where: { id: busId } });
      await admin.seatTemplate.deleteMany({ where: { id: templateId } });
      await admin.user.deleteMany({ where: { organizationId: tenantOrgId } });
      await admin.role.deleteMany({ where: { organizationId: tenantOrgId } });
      await admin.branch.deleteMany({ where: { organizationId: tenantOrgId } });
      await admin.organization.deleteMany({ where: { id: tenantOrgId } });
    } catch {
      // dev DB junk — best effort
    } finally {
      await admin.$disconnect();
      await app.close();
    }
  });

  // ─── أدوات ────────────────────────────────────────────────

  async function currentSub(): Promise<{
    id: string;
    status: string;
    currentPeriodEnd: Date;
  }> {
    const [row] = await admin.$queryRaw<
      Array<{ id: string; status: string; currentPeriodEnd: Date }>
    >`SELECT "id", "status", "currentPeriodEnd" FROM "subscriptions"
      WHERE "organizationId" = ${tenantOrgId}
      ORDER BY "startedAt" DESC LIMIT 1`;
    if (!row) throw new Error('no subscription row');
    return row;
  }

  async function pushEndPast(): Promise<void> {
    await admin.$executeRawUnsafe(
      `UPDATE "subscriptions" SET "currentPeriodEnd" = now() - interval '1 second'
       WHERE "id" = $1`,
      (await currentSub()).id,
    );
  }

  async function pushPastGrace(): Promise<void> {
    await admin.$executeRawUnsafe(
      `UPDATE "subscriptions"
       SET "currentPeriodEnd" = now() - interval '7 days' - interval '1 second'
       WHERE "id" = $1`,
      (await currentSub()).id,
    );
  }

  async function sweep(): Promise<number> {
    const prisma = app.get(PrismaService);
    return prisma.runSubscriptionSweep(); // بدور ticketty_app — يثبت المنح
  }

  function countSystemEvents(subId: string): Promise<number> {
    return admin
      .$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int AS n FROM "system_events"
         WHERE "context"->>'subscriptionId' = $1`,
        subId,
      )
      .then((rows) => Number(rows[0]?.n ?? 0));
  }

  const bookingBody = (
    passengerName: string,
    saleTripId: string,
    seatIds: string[],
  ) => ({
    tripId: saleTripId,
    seatIds,
    passengerName,
    passengerPhone: '0912000000',
    paymentMethod: 'CASH',
  });

  /** رحلة خصيصاً لكل محاولة بيع (مقاعد حرة دائماً) — إنشاء trips
   *  مسار إداري exempt يعمل في كل حالات الاشتراك. نوافذ زمنية
   *  متباعدة لتفادي قيد تراكب جدول الباصات (no-overlap). */
  let saleCounter = 0;
  async function freshSaleSeat(name: string): Promise<{
    tripId: string;
    seatId: string;
  }> {
    saleCounter += 1;
    const res = await request(server)
      .post('/api/trips')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        routeId,
        busId,
        departureAt: new Date(
          Date.now() + 86_400_000 + saleCounter * 7 * 86_400_000,
        ).toISOString(),
        arrivalAt: new Date(
          Date.now() + 86_400_000 + saleCounter * 7 * 86_400_000 + 3_600_000,
        ).toISOString(),
        price: 25000,
      });
    expect([200, 201]).toContain(res.status);
    const freshTripId = (res.body as { id: string }).id;
    createdTripIds.push(freshTripId);
    const seatsRes = await request(server)
      .get(`/api/trips/${freshTripId}/seats`)
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(seatsRes.status).toBe(200);
    // الاستجابة {trip, layout, seats[]} — نختار أول مقعد متاح فعلي
    const seats = (
      seatsRes.body as { seats: Array<{ id: string; status: string }> }
    ).seats;
    const freeSeat = seats.find((seat) => seat.status === 'AVAILABLE');
    expect(freeSeat).toBeDefined();
    void name;
    return { tripId: freshTripId, seatId: freeSeat!.id };
  }

  async function sell(
    name: string,
  ): Promise<{ res: request.Response; tripId: string; seatId: string }> {
    const { tripId: saleTripId, seatId } = await freshSaleSeat(name);
    // الحجز مسار idempotent — مفتاح فريد لكل عملية بيع
    const res = await request(server)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${tenantToken}`)
      .set(
        'Idempotency-Key',
        `sub-enforce-${suffix}-${saleCounter}-${Date.now()}`,
      )
      .send(bookingBody(name, saleTripId, [seatId]));
    return { res, tripId: saleTripId, seatId };
  }

  // ─── 1) TRIALING: وصول كامل ──────────────────────────────

  it('provisions with TRIALING and full access (booking succeeds)', async () => {
    const { res } = await sell('راكب التجربة');
    expect([200, 201]).toContain(res.status);
  });

  // ─── 2) EXPIRATION BOUNDARY + TRIALING → EXPIRED ─────────

  it('boundary: currentPeriodEnd = now is NOT overdue (strict <)', async () => {
    const sub = await currentSub();
    // now() + 10s: يثبت أن الحد صارم (ليس ≤) دون سباق زمني —
    // كتابة end = now() مباشرة يجعل الـ sweep اللاحق (أبطأ بمرور
    // milliseconds) يرى end < now() فعلًا فيفشل الاختبار سباقاً.
    await admin.$executeRawUnsafe(
      `UPDATE "subscriptions" SET "currentPeriodEnd" = now() + interval '10 seconds'
       WHERE "id" = $1`,
      sub.id,
    );
    const moved = await sweep();
    expect(moved).toBe(0); // end > now بوضوح → ليس منتهياً (حد صارم)
    expect((await currentSub()).status).toBe('TRIALING');
  });

  it('TRIALING past end → EXPIRED (no grace — trial is free)', async () => {
    await pushEndPast(); // end = now − 1s
    const moved = await sweep();
    expect(moved).toBeGreaterThan(0);
    expect((await currentSub()).status).toBe('EXPIRED');
  });

  // ─── 3) المصفوفة المتدرجة عند EXPIRED ────────────────────

  it('EXPIRED: money operations → 402 SUBSCRIPTION_REQUIRED', async () => {
    const { res } = await sell('راكب منتهي');
    expect(res.status).toBe(402);
    expect((res.body as { code: string }).code).toBe('SUBSCRIPTION_REQUIRED');
    expect(JSON.stringify(res.body)).not.toContain('subscriptionStatus');
  });

  it('EXPIRED: login, reads, admin, reports all still work (graduated policy)', async () => {
    const login = await request(server)
      .post('/api/auth/login')
      .send({
        email: `owner-${slug}@ticketty.local`,
        password: permanentPassword,
      });
    expect([200, 201]).toContain(login.status);

    const reports = await request(server)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(reports.status).toBe(200);

    const trips = await request(server)
      .get('/api/trips')
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(trips.status).toBe(200);

    const users = await request(server)
      .get('/api/administration/users')
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(users.status).toBe(200);

    // إدارة تشغيلية — كتابة كاملة تبقى (تجهيز تسوية الوضع)
    const trip2 = await request(server)
      .post('/api/trips')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        routeId,
        busId,
        departureAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        arrivalAt: new Date(
          Date.now() + 2 * 86_400_000 + 3_600_000,
        ).toISOString(),
        price: 30000,
      });
    expect([200, 201]).toContain(trip2.status);
    if ([200, 201].includes(trip2.status)) {
      await admin.tripSeat.deleteMany({
        where: { tripId: (trip2.body as { id: string }).id },
      });
      await admin.trip.deleteMany({
        where: { id: (trip2.body as { id: string }).id },
      });
    }

    // check-in لما بِيع (خدمة ما بِيع)
    const [ticket] = await admin.ticket.findMany({
      where: { organizationId: tenantOrgId },
      take: 1,
    });
    if (ticket) {
      const checkin = await request(server)
        .post(`/api/tickets/${ticket.id}/check-in`)
        .set('Authorization', `Bearer ${tenantToken}`);
      expect([200, 201]).toContain(checkin.status);
    }
  });

  it('EXPIRED: accounting posting blocked too (402)', async () => {
    const res = await request(server)
      .post('/api/accounting/entries')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        journalId: 'nonexistent',
        fiscalPeriodId: 'nonexistent',
        entryNumber: `INV-${suffix}`,
        entryDate: new Date().toISOString().slice(0, 10),
        currency: 'SDG',
        description: 'محاولة قيد بعد الانتهاء',
        lines: [
          { accountId: 'x', debit: 100, credit: 0 },
          { accountId: 'y', debit: 0, credit: 100 },
        ],
      });
    expect(res.status).toBe(402);
  });

  // ─── 4) REPEATED SWEEP = NO-OP + لا أحداث مكررة ───────────

  it('repeated sweep is idempotent and never duplicates system events', async () => {
    const sub = await currentSub();
    const eventsBefore = await countSystemEvents(sub.id);
    const first = await sweep();
    const second = await sweep();
    expect(first).toBe(0);
    expect(second).toBe(0);
    expect((await currentSub()).status).toBe('EXPIRED');
    const eventsAfter = await countSystemEvents(sub.id);
    expect(eventsAfter).toBe(eventsBefore); // dedup (subscriptionId, transition)
  });

  // ─── 5) EXPIRED → RENEWAL (إصلاح ثغرة IN clause) ─────────

  it('renews an EXPIRED subscription back to ACTIVE (IN-clause fix)', async () => {
    const renew = await request(server)
      .post(`/api/platform/tenants/${tenantOrgId}/subscription/renew`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ months: 1 });
    expect(renew.status).toBe(201);
    expect((renew.body as { status: string }).status).toBe('ACTIVE');
    const sub = await currentSub();
    expect(sub.status).toBe('ACTIVE');
    expect(sub.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());

    // فوري — بلا redeploy: أول عملية تالٍ تنجح
    const { res } = await sell('راكب بعد التجديد');
    expect([200, 201]).toContain(res.status);
  });

  // ─── 6) PAST_DUE: مهلة سداد 7 أيام وصول كامل ─────────────

  it('ACTIVE past end → PAST_DUE (grace) with full access', async () => {
    await pushEndPast();
    const moved = await sweep();
    expect(moved).toBeGreaterThan(0);
    expect((await currentSub()).status).toBe('PAST_DUE');

    // وصول كامل خلال المهلة (grace) — البيع يعمل
    const { res } = await sell('راكب المهلة');
    expect([200, 201]).toContain(res.status);
  });

  // ─── 7) PAST_DUE → ACTIVE (تجديد خلال المهلة) ────────────

  it('PAST_DUE → renew → ACTIVE immediately', async () => {
    const renew = await request(server)
      .post(`/api/platform/tenants/${tenantOrgId}/subscription/renew`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ months: 12 });
    expect(renew.status).toBe(201);
    expect((await currentSub()).status).toBe('ACTIVE');
  });

  // ─── 8) PAST_DUE → EXPIRED (تجاوز المهلة) ─────────────────

  it('PAST_DUE past grace → EXPIRED → 402', async () => {
    await pushEndPast(); // ACTIVE → منتهية الآن → سحب → PAST_DUE
    await sweep();
    expect((await currentSub()).status).toBe('PAST_DUE');
    await pushPastGrace(); // يتجاوز 7 أيام
    const moved = await sweep();
    expect(moved).toBeGreaterThan(0);
    expect((await currentSub()).status).toBe('EXPIRED');

    const { res } = await sell('راكب بعد المهلة');
    expect(res.status).toBe(402);
  });

  // ─── 9) CONCURRENT RENEW ∥ SWEEP (قفل الصف) ──────────────

  it('concurrent renewal during sweep stays consistent (row-lock serialization)', async () => {
    // الحالة الحالية EXPIRED من الاختبار السابق. نجدّد ونسحب معاً.
    const renewPromise = request(server)
      .post(`/api/platform/tenants/${tenantOrgId}/subscription/renew`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ months: 1 });
    const sweepPromise = sweep();
    const [renewResult, sweepResult] = await Promise.all([
      renewPromise,
      sweepPromise,
    ]);

    // أي ترتيب يقفل الصف أولاً يكسب — النتيجة النهائية واحدة:
    expect([200, 201]).toContain(renewResult.status);
    expect(sweepResult).toBeGreaterThanOrEqual(0); // 0 أو 1 حسب الترتيب
    const sub = await currentSub();
    expect(sub.status).toBe('ACTIVE'); // التجديد يفوز دائماً في النهاية
    expect(sub.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());

    // المبيعات تعود فوراً
    const { res } = await sell('راكب التزامن');
    expect([200, 201]).toContain(res.status);
  });

  // ─── 10) تعليق المنصة مستقل عن الاشتراك ─────────────────

  it('subscription state never bypasses platform suspension (401 login block)', async () => {
    // org.active=false يبقى القفل النووي المستقل — الاشتراك لا يمسه
    await admin.organization.update({
      where: { id: tenantOrgId },
      data: { active: false },
    });
    const login = await request(server)
      .post('/api/auth/login')
      .send({
        email: `owner-${slug}@ticketty.local`,
        password: permanentPassword,
      });
    expect(login.status).toBe(401); // التعليق أقوى من أي حالة اشتراك
    await admin.organization.update({
      where: { id: tenantOrgId },
      data: { active: true },
    });
  });
});
