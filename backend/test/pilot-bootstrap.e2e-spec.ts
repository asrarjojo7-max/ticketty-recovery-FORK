import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AccountingEventWorker } from '../src/accounting/accounting-event.worker';
import { configureApp } from '../src/bootstrap/configure-app';
import { loginAndRotateTemporaryPassword } from './helpers/auth';

/**
 * PILOT BLOCKER-1 — التزويد المحاسبي الافتتاحي الذرّي (e2e)
 * ====================================================================
 * يثبت حرفياً ما اشترطه المالك:
 *   New Tenant → provisioning → login → create trip → booking/sale
 *   → accounting event → worker → POSTED → balanced journal
 *
 * الفكرة المركزية: شركة جديدة عبر المنصة يجب أن تعمل بيعها الأول
 * من أول لحظة بلا أي تدخل يدوي — الفترة + الحسابات + السياسات
 * جزء من التزويد (ذريّة: فشل أي جزء يفشل الكل).
 *
 * الخطوة الحاسمة: تشغيل الـ worker فعلياً (runOnce) على حدث
 * البيع والتأكد أن القيد POSTED ومتوازن (Σdebit = Σcredit).
 */

const OPERATOR_PASSWORD = 'E2eTest-Passw0rd-2026';
const OWNER_PASSWORD = 'Pilot-Bootstrap-Passw0rd-2026';

type Server = import('http').Server;

describe('BLOCKER-1: tenant provisioning creates accounting bootstrap (e2e)', () => {
  let app: INestApplication<App>;
  let server: Server;
  const admin = new PrismaClient();
  const slug = `pilot-bootstrap-${process.pid}-${Date.now()}`;
  let tenantOrgId = '';
  let ownerToken = '';
  let operatorToken = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(['error', 'warn']);
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as unknown as Server;

    const login = await request(server).post('/api/auth/login').send({
      email: 'e2e-owner@ticketty.local',
      password: OPERATOR_PASSWORD,
    });
    expect([200, 201]).toContain(login.status);
    operatorToken = (login.body as { access_token: string }).access_token;
  }, 120_000);

  afterAll(async () => {
    // تنظيف جذري داخل معاملة ذرّية واحدة. ALTER TABLE قابل
    // للتراجع في PostgreSQL: أي انهيار وسط التنظيف يُرجع الـ
    // DISABLE نفسه — فلا يمكن أن تبقى الحارسات معطلة أبداً
    // (نمط BEGIN/COMMIT المنفصل كان يتركها معطلة عند timeout —
    // حدث فعلاً وأفسد تشغيلات لاحقة كاملة).
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
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM accounting_events WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM journal_entry_lines WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM journal_entries WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM accounting_policies WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM fiscal_periods WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM journals WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM accounts WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM refunds WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM payments WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM commissions WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM tickets WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM bookings WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM idempotency_records WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM trip_seats WHERE "tripId" IN (SELECT id FROM trips WHERE "organizationId" = $1)`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM trips WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM route_stops WHERE "routeId" IN (SELECT id FROM routes WHERE "organizationId" = $1)`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM routes WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM buses WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM seat_templates WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM subscriptions WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM users WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM roles WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM branches WHERE "organizationId" = $1`,
            tenantOrgId,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM organizations WHERE "id" = $1`,
            tenantOrgId,
          );
          // ENABLE داخل نفس المعاملة: عند النجاح يُسلح قبل COMMIT،
          // وعند أي فشل يُرجع الـ ROLLBACK الـ DISABLE والـ ENABLE
          // معاً — الحارس لا يبقى معطلاً في أي سيناريو.
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
      // رُجعت المعاملة كاملة — الحارسات سليمة بضمانة الذرّية.
    } finally {
      await admin.$disconnect();
      await app.close();
    }
  }, 120_000);

  it('provisions a new tenant WITH full accounting bootstrap, atomically', async () => {
    // 1) التزويد عبر المنصة (platform operator)
    const provisioned = await request(server)
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        name: 'شركة رحلة الافتتاح',
        slug,
        ownerName: 'مالك رحلة الافتتاح',
        ownerEmail: `owner-${slug}@ticketty.local`,
        initialPassword: OWNER_PASSWORD,
        primaryBranchName: 'الفرع الرئيسي',
        primaryBranchCity: 'الخرطوم',
      });
    expect(provisioned.status).toBe(201);
    tenantOrgId = (provisioned.body as { organization: { id: string } })
      .organization.id;

    // 2) الذرّية: التزويد أنجز كل التهيئة أو لا شيء — نفحص كل أجزائها
    const [accounts, journal, period, policies] = await Promise.all([
      admin.account.findMany({
        where: { organizationId: tenantOrgId },
      }),
      admin.journal.findFirst({ where: { organizationId: tenantOrgId } }),
      admin.fiscalPeriod.findFirst({
        where: { organizationId: tenantOrgId, status: 'OPEN' },
      }),
      admin.accountingPolicy.findMany({
        where: { organizationId: tenantOrgId, active: true },
      }),
    ]);

    // الحسابات الأربعة التي تستهلكها السياسات فعلاً (لا وهمية)
    expect(accounts.map((a) => a.code).sort()).toEqual(
      ['1010', '2010', '4000', '5010'].sort(),
    );
    expect(journal?.code).toBe('GJ');
    // فترة مالية مفتوحة تغطي "الآن"
    expect(period).toBeTruthy();
    expect(new Date(period!.startsAt).getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
    expect(new Date(period!.endsAt).getTime()).toBeGreaterThanOrEqual(
      Date.now(),
    );
    // السياسات الأربع — كل نوع حدث في النظام مغطى
    expect(policies.length).toBe(4);
    const policyTypes = policies.map((p) => p.eventType).sort();
    expect(policyTypes).toEqual(
      [
        'AGENT_SETTLEMENT',
        'EXPENSE_APPROVED',
        'PAYMENT_RECEIVED',
        'REFUND_COMPLETED',
      ].sort(),
    );
    // كل سياسة بحسابين مختلفين (قيد check الداتابيز) وdebit≠credit
    for (const policy of policies) {
      expect(policy.debitAccountId).not.toBe(policy.creditAccountId);
    }
  });

  it('the bootstrapped tenant logs in, creates a trip, sells, and the accounting event POSTS a balanced journal entry', async () => {
    // ── login ──────────────────────────────────────────────
    ownerToken = await loginAndRotateTemporaryPassword(
      server,
      `owner-${slug}@ticketty.local`,
      OWNER_PASSWORD,
      `${OWNER_PASSWORD}-Permanent`,
    );

    // ── fleet prerequisites (template → bus → route) ───────
    const template = await request(server)
      .post('/api/seat-templates')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'قالب الافتتاح',
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
    expect(template.status).toBe(201);

    const bus = await request(server)
      .post('/api/buses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        plateNumber: `PB${Date.now() % 100000}`,
        seatTemplateId: (template.body as { id: string }).id,
      });
    expect(bus.status).toBe(201);

    const route = await request(server)
      .post('/api/routes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'خط الافتتاح',
        fromCity: 'الخرطوم',
        toCity: 'بورتسودان',
        stops: [
          { city: 'الخرطوم', order: 0 },
          { city: 'بورتسودان', order: 1 },
        ],
      });
    expect(route.status).toBe(201);

    const departureAt = new Date(Date.now() + 86_400_000);
    const trip = await request(server)
      .post('/api/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        routeId: (route.body as { id: string }).id,
        busId: (bus.body as { id: string }).id,
        departureAt: departureAt.toISOString(),
        arrivalAt: new Date(departureAt.getTime() + 3_600_000).toISOString(),
        price: 15_000,
      });
    expect(trip.status).toBe(201);
    const tripId = (trip.body as { id: string }).id;

    // ── booking + CASH sale ─────────────────────────────────
    const seatsRes = await request(server)
      .get(`/api/trips/${tripId}/seats`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const seat = (
      seatsRes.body as {
        seats: Array<{ id: string; status: string; price: string }>;
      }
    ).seats.find((s) => s.status === 'AVAILABLE');
    expect(seat).toBeTruthy();

    const sale = await request(server)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `pilot-bootstrap-sale-${slug}`)
      .send({
        tripId,
        seatIds: [seat!.id],
        passengerName: 'مسافر الافتتاح',
        passengerPhone: '0912000000',
        paymentMethod: 'CASH',
      });
    expect(sale.status).toBe(201);
    const paymentId = (sale.body as { payments: Array<{ id: string }> })
      .payments[0].id;

    // ── accounting event وُلِد ────────────────────────────
    const event = await admin.accountingEvent.findFirstOrThrow({
      where: {
        organizationId: tenantOrgId,
        eventType: 'PAYMENT_RECEIVED',
        sourceId: paymentId,
      },
    });
    expect(['PENDING', 'FAILED']).toContain(event.status); // لم يُعالج بعد

    // ── worker: معالجة الحدث فعلياً (نفس مسار الإنتاج) ─────
    // الـ worker يلتقط الأقدم أولاً (ORDER BY createdAt) — نستنزف
    // دورات محدودة حتى يُعالَج حدثنا تحديداً (bfa أي backlog
    // عالمي قديم لا يجب أن يفسد هذا الاختبار).
    const worker = app.get(AccountingEventWorker);
    let ourEventPosted = false;
    for (let i = 0; i < 200 && !ourEventPosted; i++) {
      // full runs: older global backlog drains first
      await worker.runOnce();
      const fresh = await admin.accountingEvent.findUnique({
        where: { id: event.id },
      });
      ourEventPosted = fresh?.status === 'POSTED';
    }
    expect(ourEventPosted).toBe(true);

    // ── POSTED + balanced journal ──────────────────────────
    const processedEvent = await admin.accountingEvent.findUniqueOrThrow({
      where: { id: event.id },
      include: { journalEntry: { include: { lines: true } } },
    });
    expect(processedEvent.status).toBe('POSTED');
    expect(processedEvent.journalEntry).toBeTruthy();
    expect(processedEvent.journalEntry!.status).toBe('POSTED');

    // متوازن: Σdebit = Σcredit = قيمة الدفعة
    const lines = processedEvent.journalEntry!.lines;
    const sumDebit = lines.reduce((a, l) => a + Number(l.debit), 0);
    const sumCredit = lines.reduce((a, l) => a + Number(l.credit), 0);
    const payment = await admin.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    expect(sumDebit).toBeCloseTo(Number(payment.amount), 2);
    expect(sumCredit).toBeCloseTo(sumDebit, 2);
    // سطران: مدين الصندوق / دائن الإيراد (سياسة PAYMENT_RECEIVED)
    expect(lines.length).toBe(2);
    const debitLine = lines.find((l) => Number(l.debit) > 0)!;
    const creditLine = lines.find((l) => Number(l.credit) > 0)!;
    const cashAccount = await admin.account.findFirstOrThrow({
      where: { organizationId: tenantOrgId, code: '1010' },
    });
    const revenueAccount = await admin.account.findFirstOrThrow({
      where: { organizationId: tenantOrgId, code: '4000' },
    });
    expect(debitLine.accountId).toBe(cashAccount.id);
    expect(creditLine.accountId).toBe(revenueAccount.id);

    // القيد داخل فترة الافتتاح نفسها (الذريّة ربطت كل شيء)
    expect(processedEvent.journalEntry!.fiscalPeriodId).toBe(
      (
        await admin.fiscalPeriod.findFirstOrThrow({
          where: { organizationId: tenantOrgId, status: 'OPEN' },
        })
      ).id,
    );
  }, 60_000);

  it('atomicity: a provisioning failure leaves NO half-initialized tenant', async () => {
    // فشل مضمون: نفس slug منظمتنا المزودة في نفس الـ run —
    // الحارس الداخلي (PLATFORM_SLUG_TAKEN) يرمي قبل أي INSERT.
    const res = await request(server)
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        name: 'شركة تكرار slug',
        slug, // مأخوذ من الاختبار الأول
        ownerName: 'مالك',
        ownerEmail: `dup-${slug}@ticketty.local`,
        initialPassword: OWNER_PASSWORD,
      });
    expect(res.status).toBe(409); // فشل التزويد — نظيف

    // لا أثر جزئي: المنظمة الوحيدة بهذا الـ slug هي الأصلية
    // (تزويد واحد فقط — لا ثانية ناقصة بلا سياسات)
    const orgs = await admin.organization.findMany({
      where: { slug },
      select: { id: true },
    });
    expect(orgs.length).toBe(1);
    expect(orgs[0].id).toBe(tenantOrgId);

    // الذرّية عبر الطبقات: المالك المكرر لم يُنشأ (email guard)
    const dupOwner = await admin.user.count({
      where: { email: `dup-${slug}@ticketty.local` },
    });
    expect(dupOwner).toBe(0);
  });
});
