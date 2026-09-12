import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

/**
 * Phase 5 (Option A) — Payment Integrity: CASH-only by construction.
 *
 * العقد (§5.3-A المقرر من المالك):
 *  ① تسجيل طريقة رقمية (CARD/BANKAK/MTN_MOMO/ZAIN_CASH/BANK_TRANSFER)
 *     → 400 صريح من الـ DTO — phantom payment مستحيلة البتة: لا يمكن
 *     تسجيلها أصلًا (تأكيد رقمي بلا provider = إيراد وهمي).
 *  ② CASH يعمل — البيع النقدي مسموح دائمًا (الوضع القائم الصحيح).
 *  ③ كل المدفوعات الموجودة في قاعدة البيانات نقد فقط (invariant
 *     المستقبل: أي تسريب لقيمة رقمية = فشل فوري).
 *  ④ الرسالة عربية واضحة تشرح أن الطرق الرقمية "محفوظة" (reserved)
 *     وليست "خاطئة الإدخال" — دليل للمستخدم والوكيل بالأمساك.
 *
 * لماذا هنا وليس unit فقط: هذه حدود API حقيقية — الـ e2e يثبت أن
 * الحاجز في مكانه عبر HTTP كاملًا (validation pipeline فعلًا يعترض).
 */
describe('Payment integrity — Option A: CASH-only (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  const admin = new PrismaClient();

  let token = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(['error', 'warn']);
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    // تسجيل دخول واحد للسلسلة كلها — حد الـ throttle 5/دقيقة.
    const login = await request(server)
      .post('/api/auth/login')
      .send({
        email: process.env.INITIAL_ADMIN_EMAIL ?? 'e2e-owner@ticketty.local',
        password: 'E2eTest-Passw0rd-2026',
      });
    expect([200, 201]).toContain(login.status);
    token = (login.body as { access_token: string }).access_token;
  });

  afterAll(async () => {
    await app.close();
    await admin.$disconnect();
  });

  // ─── ① الطرق الرقمية → 400 ─────────────────────────────────

  it.each(['CARD', 'BANKAK', 'MTN_MOMO', 'ZAIN_CASH', 'BANK_TRANSFER'])(
    'rejects %s with a clear Arabic 400 (phantom payment impossible)',
    async (method) => {
      // أي حجز يتطلب رحلة/مقاعد صالحة — لكن الـ validation يرفض قبل
      // الوصول لأي منطق: نرسل body بسيطًا، الحاجز الـ DTO أول ما
      // يقف. (tripId وهمي كافٍ — الفشل المطلوب 400 وليس 404.)
      const res = await request(server)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tripId: 'phase5-validation-probe',
          seatIds: ['probe-seat'],
          passengerName: 'فحص الطرق الرقمية',
          passengerPhone: '0912000000',
          paymentMethod: method,
        });
      expect(res.status).toBe(400);
      const body = res.body as { code?: string; message?: string | string[] };
      expect(body.code).toBe('VALIDATION_ERROR');
      // الرسالة تشرح أن الرقمية محفوظة — ليست "قيمة غير صالحة" عامة.
      const message = Array.isArray(body.message)
        ? body.message.join(' ')
        : body.message;
      expect(String(message)).toContain('نقدًا');
    },
  );

  it('rejects unknown methods too (enum bypass attempt)', async () => {
    const res = await request(server)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tripId: 'probe',
        seatIds: ['probe-seat'],
        passengerName: 'محاولة تجاوز',
        passengerPhone: '0912000000',
        paymentMethod: 'SUPER_CASH_9000',
      });
    expect(res.status).toBe(400);
  });

  // ─── ② CASH يمر عبر الحاجز (400 يرفض فقط الرقمية) ──────────

  it('CASH passes DTO validation (proceeds to business logic)', async () => {
    const res = await request(server)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `phase5-cash-probe-${Date.now()}`)
      .send({
        tripId: 'phase5-cash-probe-nonexistent-trip',
        seatIds: ['probe-seat'],
        passengerName: 'نقدي عبر الحاجز',
        passengerPhone: '0912000000',
        paymentMethod: 'CASH',
      });
    // ليس 400 — الحاجز فتح؛ الرفض هنا من منطق الأعمال (الرحلة غير
    // موجودة) 404 — وهذا بالضبط هو الإثبات المطلوب: validation يمر.
    expect(res.status).not.toBe(400);
  });

  // ─── ③ Invariant قاعدة البيانات: لا مدفوعات رقمية إطلاقاً ──

  it('database invariant: zero non-CASH payment rows exist', async () => {
    const rows = await admin.payment.count({
      where: { method: { not: 'CASH' } },
    });
    expect(rows).toBe(0);
  });

  it('database invariant: enum still declares reserved digital values (documented, not deleted)', async () => {
    // القيم الرقمية تبقى معرفة في الـ enum — reserved للخيار B
    // المستقبلي. حذفها كان سيكسر التقارير القديمة والتوافق.
    const result = await admin.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'PaymentMethod'`;
    const labels = result.map((r) => r.enumlabel);
    expect(labels).toEqual(
      expect.arrayContaining([
        'CASH',
        'CARD',
        'BANKAK',
        'MTN_MOMO',
        'ZAIN_CASH',
        'BANK_TRANSFER',
      ]),
    );
  });
});
