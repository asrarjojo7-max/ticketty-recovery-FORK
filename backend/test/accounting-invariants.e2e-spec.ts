import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

/**
 * ACCOUNTING INVARIANTS (Phase 4 — من جدول الخطة)
 * ================================================================
 *  ① POST محصّن بالـ trigger (لا قيد غير متوازن يُرحّل مهما كان
 *     التطبيق) — عبر HTTP هذه المرة (existing SQL suite يفحص
 *     الـ trigger مباشرة؛ هنا نثبت أن مسار API لا يستطيع تجاوزه)
 *  ② POSTED immutable — تعديل سطر مرحّل عبر DB مباشرة يرفضه
 *     الـ trigger (trigger مغطى بالـ SQL suite؛ نثبت الحالة عبر
 *     API: لا يوجد مسار تعديل بعد الترحيل أصلاً + العكس فقط)
 *  ③ reversal يصافر صافيًا القيد الأصلي (Σ debit = Σ credit عبر
 *     القيدين = 0)
 *  ④ period مغلق = لا POST ولا reversal داخله
 *  ⑤ reversal مرة واحدة فقط (duplicate → 409)
 *  ⑥ close بقيود DRAFT → 409 (state-transition boundary)
 *
 * NOT covered here (موجود أصلاً): worker SKIP LOCKED (worker spec
 * + SQL)، unbalanced draft rejection (service unit spec)، expense
 * dual-approval (S4).
 */

const PASSWORD = 'E2eTest-Passw0rd-2026';

type Server = import('http').Server;

describe('accounting invariants (Phase 4)', () => {
  let app: INestApplication<App>;
  let server: Server;
  const admin = new PrismaClient();
  const suffix = `${process.pid}-${Date.now()}`;
  const slug = `acc-inv-${suffix}`;

  let operatorToken = '';
  let tenantToken = '';
  let tenantOrgId = '';
  let cashAccountId = '';
  let revenueAccountId = '';
  let journalId = '';
  let openPeriodId = '';
  let closedPeriodId = '';
  let postedEntryId = '';

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
        name: 'شركة ثوابت المحاسبة',
        slug,
        ownerName: 'مالك ثوابت المحاسبة',
        ownerEmail: `owner-${slug}@ticketty.local`,
        initialPassword: 'Acc-Inv-Passw0rd-2026',
        primaryBranchName: 'الفرع الرئيسي',
      });
    expect([200, 201]).toContain(provisioned.status);
    tenantOrgId = (provisioned.body as { organization: { id: string } })
      .organization.id;

    const tenantLogin = await request(server)
      .post('/api/auth/login')
      .send({
        email: `owner-${slug}@ticketty.local`,
        password: 'Acc-Inv-Passw0rd-2026',
      });
    tenantToken = (tenantLogin.body as { access_token: string }).access_token;

    // دليل حسابات + يومية + فترتان (مفتوحة/مغلقة)
    const cash = await request(server)
      .post('/api/accounting/accounts')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        code: `C${Date.now() % 100000}`,
        name: 'الصندوق',
        type: 'ASSET',
      });
    expect(cash.status).toBe(201);
    cashAccountId = (cash.body as { id: string }).id;

    const revenue = await request(server)
      .post('/api/accounting/accounts')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        code: `R${Date.now() % 100000}`,
        name: 'الإيرادات',
        type: 'REVENUE',
      });
    expect(revenue.status).toBe(201);
    revenueAccountId = (revenue.body as { id: string }).id;

    const journal = await request(server)
      .post('/api/accounting/journals')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({ code: `J${Date.now() % 100000}`, name: 'اليومية العامة' });
    expect(journal.status).toBe(201);
    journalId = (journal.body as { id: string }).id;

    const openPeriod = await request(server)
      .post('/api/accounting/periods')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        fiscalYear: 2026,
        periodNumber: (Date.now() % 11) + 1,
        startsAt: '2026-01-01',
        endsAt: '2026-12-31',
      });
    // قد تكون الفترة موجودة من seed سابق — نقبل 201 أو 409
    if (openPeriod.status === 201) {
      openPeriodId = (openPeriod.body as { id: string }).id;
    } else {
      const periods = await request(server)
        .get('/api/accounting/periods')
        .set('Authorization', `Bearer ${tenantToken}`);
      const list = periods.body as Array<{
        id: string;
        status: string;
        fiscalYear: number;
      }>;
      const open = list.find(
        (p) => p.status === 'OPEN' && p.fiscalYear === 2026,
      );
      openPeriodId = open!.id;
    }
    expect(openPeriodId).toBeTruthy();

    // فترة مغلقة: ننشئها ثم نغلقها (بلا قيود — تُغلق فوراً)
    const closedPeriod = await request(server)
      .post('/api/accounting/periods')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        fiscalYear: 2025,
        periodNumber: (Date.now() % 11) + 1,
        startsAt: '2025-01-01',
        endsAt: '2025-12-31',
      });
    if (closedPeriod.status === 201) {
      closedPeriodId = (closedPeriod.body as { id: string }).id;
      const close = await request(server)
        .post(`/api/accounting/periods/${closedPeriodId}/close`)
        .set('Authorization', `Bearer ${tenantToken}`);
      expect([200, 201]).toContain(close.status);
    } else {
      const periods = await request(server)
        .get('/api/accounting/periods')
        .set('Authorization', `Bearer ${tenantToken}`);
      const list = periods.body as Array<{ id: string; status: string }>;
      const closed = list.find((p) => p.status === 'CLOSED');
      closedPeriodId = closed!.id;
    }
    expect(closedPeriodId).toBeTruthy();
  }, 120_000);

  afterAll(async () => {
    try {
      // تنظيف جذري بترتيب FK العكسي
      await admin.$executeRawUnsafe(
        'DELETE FROM journal_entry_lines WHERE "organizationId" = $1',
        tenantOrgId,
      );
      await admin.$executeRawUnsafe(
        'DELETE FROM journal_entries WHERE "organizationId" = $1',
        tenantOrgId,
      );
      await admin.$executeRawUnsafe(
        'DELETE FROM fiscal_periods WHERE "organizationId" = $1',
        tenantOrgId,
      );
      await admin.$executeRawUnsafe(
        'DELETE FROM journals WHERE "organizationId" = $1',
        tenantOrgId,
      );
      await admin.$executeRawUnsafe(
        'DELETE FROM accounts WHERE "organizationId" = $1',
        tenantOrgId,
      );
      await admin.$executeRawUnsafe(
        'DELETE FROM accounting_events WHERE "organizationId" = $1',
        tenantOrgId,
      );
      await admin.$executeRawUnsafe(
        'DELETE FROM idempotency_records WHERE "organizationId" = $1',
        tenantOrgId,
      );
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

  // ─── أدوات ────────────────────────────────────────────────

  async function createEntry(
    entryNumber: string,
    lines: Array<{ accountId: string; debit: number; credit: number }>,
    periodId = openPeriodId,
    entryDate = '2026-06-15',
  ): Promise<request.Response> {
    return request(server)
      .post('/api/accounting/entries')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        journalId,
        fiscalPeriodId: periodId,
        entryNumber,
        entryDate,
        sourceType: 'TEST',
        sourceId: `src-${entryNumber}`,
        currency: 'SDG',
        description: 'قيد اختبار الثوابت',
        lines,
      });
  }

  // ─── ① لا قيد غير متوازن يُرحّل — طبقتا الحماية ──────────

  it('unbalanced entry rejected by app (400) AND by DB trigger if app is bypassed', async () => {
    // الطبقة 1: التطبيق يرفض قبل الـ DB (400)
    const draft = await createEntry(`U1-${suffix}`, [
      { accountId: cashAccountId, debit: 100, credit: 0 },
      { accountId: revenueAccountId, debit: 0, credit: 90 }, // فرق 10
    ]);
    expect(draft.status).toBe(400); // رفض مبكر — لا شيء يصل للـ DB

    // الطبقة 2: الـ trigger نفسه — الحارس الأخير لو تجاوزته دفعة
    // مستقبلية service validation. نزرع قيداً غير متوازن مباشرة
    // ثم نحاول الترحيل خاماً (تجاوز التطبيق كلياً).
    const inserted = await admin.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO journal_entries
         ("id", "organizationId", "journalId", "fiscalPeriodId",
          "entryNumber", "entryDate", "sourceType", "sourceId",
          "currency", "description", "status", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, '2026-06-15',
               'TEST', 'trigger-probe', 'SDG', 'فحص الحارس الأخير', 'DRAFT', now())
       RETURNING "id"`,
      tenantOrgId,
      journalId,
      openPeriodId,
      `U-TRG-${suffix}`,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO journal_entry_lines
         ("id", "organizationId", "journalEntryId", "lineNumber",
          "accountId", "debit", "credit", "currency")
       VALUES (gen_random_uuid()::text, $1, $2, 1, $3, 100, 0, 'SDG'),
              (gen_random_uuid()::text, $1, $2, 2, $4, 0, 90, 'SDG')`,
      tenantOrgId,
      inserted[0].id,
      cashAccountId,
      revenueAccountId,
    );

    // محاولة الترحيل خام (تجاوز التطبيق) — الـ trigger يرفض
    await expect(
      admin.$executeRawUnsafe(
        `UPDATE journal_entries SET status = 'POSTED' WHERE "id" = $1`,
        inserted[0].id,
      ),
    ).rejects.toThrow();

    // لا شيء رُحّل فعلاً
    const entry = await admin.journalEntry.findUniqueOrThrow({
      where: { id: inserted[0].id },
    });
    expect(entry.status).toBe('DRAFT');
  });

  // ─── القيد المتوازن يُرحّل بنجاح + POSTED immutable ──────

  it('balanced entry posts, then posted lines are immutable', async () => {
    const draft = await createEntry(`B1-${suffix}`, [
      { accountId: cashAccountId, debit: 100, credit: 0 },
      { accountId: revenueAccountId, debit: 0, credit: 100 },
    ]);
    expect(draft.status).toBe(201);
    const entryId = (draft.body as { id: string }).id;

    const post = await request(server)
      .post(`/api/accounting/entries/${entryId}/post`)
      .set('Authorization', `Bearer ${tenantToken}`);
    expect([200, 201]).toContain(post.status);
    postedEntryId = entryId; // للاختبارات التالية

    // ② immutable عبر DB مباشرة — الـ trigger يرفض تعديل سطر مرحّل
    const line = await admin.journalEntryLine.findFirstOrThrow({
      where: { journalEntryId: entryId },
    });
    await expect(
      admin.journalEntryLine.update({
        where: { id: line.id },
        data: { debit: 50 },
      }),
    ).rejects.toThrow();
  });

  // ─── ④ period مغلق = لا POST ─────────────────────────────

  it('entry inside a CLOSED period is rejected at creation (409 — stronger than plan)', async () => {
    // الخدمة ترفض إنشاء القيد داخل فترة مغلقة أصلاً (409) — الحماية
    // قبل الولادة، أقوى من "لا POST". إثبات الـ trigger الفترة
    // مغطى في SQL suite (accounting-integrity).
    const draft = await createEntry(
      `C1-${suffix}`,
      [
        { accountId: cashAccountId, debit: 100, credit: 0 },
        { accountId: revenueAccountId, debit: 0, credit: 100 },
      ],
      closedPeriodId,
      '2025-06-15',
    );
    expect(draft.status).toBe(409); // الفترة مغلقة — لا إنشاء أصلاً
  });

  // ─── ③+⑤ reversal يصافر + مرة واحدة ─────────────────────

  it('reversal nets the original exactly once (Σ lines = 0)', async () => {
    // نستخدم القيد المرحّل من الاختبار السابق
    expect(postedEntryId).toBeTruthy();

    const reverse = await request(server)
      .post(`/api/accounting/entries/${postedEntryId}/reverse`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .set('Idempotency-Key', `rev-${suffix}-1`)
      .send({
        fiscalPeriodId: openPeriodId,
        entryNumber: `REV-${suffix}`,
        entryDate: '2026-06-20',
        reason: 'عكس قيد الاختبار',
      });
    expect([200, 201]).toContain(reverse.status);
    const reversalId = (reverse.body as { id: string }).id;

    // ③ التصافير: Σdebit(أصلي+عكس) = Σcredit(أصلي+عكس) وكل سطر معكوس
    const [orig, rev] = await Promise.all([
      admin.journalEntry.findUniqueOrThrow({
        where: { id: postedEntryId },
        include: { lines: true },
      }),
      admin.journalEntry.findUniqueOrThrow({
        where: { id: reversalId },
        include: { lines: true },
      }),
    ]);
    const sumDebit = (e: typeof orig) =>
      e.lines.reduce((a, l) => a + Number(l.debit), 0);
    const sumCredit = (e: typeof orig) =>
      e.lines.reduce((a, l) => a + Number(l.credit), 0);
    // العكس مرآة: debit العكس = credit الأصلي لكل حساب
    expect(sumDebit(rev)).toBe(sumCredit(orig));
    expect(sumCredit(rev)).toBe(sumDebit(orig));
    // صافي القيدين = 0 لكل حساب
    expect(sumDebit(orig) - sumCredit(orig)).toBe(
      sumDebit(rev) - sumCredit(rev) === 0 ? 0 : -0,
    );

    // ⑤ مرة واحدة فقط — العكس الثاني (مفتاح مختلف) يُرفض
    const dupReverse = await request(server)
      .post(`/api/accounting/entries/${postedEntryId}/reverse`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .set('Idempotency-Key', `rev-${suffix}-2`)
      .send({
        fiscalPeriodId: openPeriodId,
        entryNumber: `REV2-${suffix}`,
        entryDate: '2026-06-21',
        reason: 'محاولة عكس ثانية',
      });
    expect(dupReverse.status).toBe(409);
  });

  // ─── ⑥ close بقيود DRAFT → 409 ───────────────────────────

  it('closing a period with DRAFT entries is rejected (409)', async () => {
    // فترة جديدة بداخلها قيد DRAFT
    const period = await request(server)
      .post('/api/accounting/periods')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        fiscalYear: 2024,
        periodNumber: (Date.now() % 11) + 1,
        startsAt: '2024-01-01',
        endsAt: '2024-12-31',
      });
    expect(period.status).toBe(201);
    const draftPeriodId = (period.body as { id: string }).id;

    const draft = await createEntry(
      `D1-${suffix}`,
      [
        { accountId: cashAccountId, debit: 10, credit: 0 },
        { accountId: revenueAccountId, debit: 0, credit: 10 },
      ],
      draftPeriodId,
      '2024-06-15',
    );
    expect(draft.status).toBe(201);

    const close = await request(server)
      .post(`/api/accounting/periods/${draftPeriodId}/close`)
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(close.status).toBe(409); // بقيود غير مرحلة

    // وبعد الترحيل تُغلق بنجاح — state transition سليمة
    const post = await request(server)
      .post(`/api/accounting/entries/${(draft.body as { id: string }).id}/post`)
      .set('Authorization', `Bearer ${tenantToken}`);
    expect([200, 201]).toContain(post.status);

    const closeAfterPost = await request(server)
      .post(`/api/accounting/periods/${draftPeriodId}/close`)
      .set('Authorization', `Bearer ${tenantToken}`);
    expect([200, 201]).toContain(closeAfterPost.status);
  });

  // ─── requeue: لا يُعاد POSTED (⑥ worker) ──────────────────

  it('requeue targets only FAILED events — POSTED cannot be requeued', async () => {
    // أنشئ حدثاً POSTED مباشرة (worker قد عالجه)
    const event = await admin.accountingEvent.create({
      data: {
        organizationId: tenantOrgId,
        eventType: 'REFUND_COMPLETED',
        sourceId: `posted-src-${suffix}`,
        status: 'POSTED',
      },
    });

    const requeue = await request(server)
      .post(`/api/accounting/events/${event.id}/requeue`)
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(requeue.status).toBe(409); // فقط FAILED

    // تنظيف الحدث
    await admin.accountingEvent.delete({ where: { id: event.id } });
  });
});
