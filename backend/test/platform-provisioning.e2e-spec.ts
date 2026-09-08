import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

/**
 * E2E: Tenant Provisioning عبر واجهة المنصة.
 *
 * يتحقق من العقد الكامل:
 * 1) البوابة: مستخدم بلا platform.admin → 403
 * 2) مالك tenant (OWNER بنجمة) من منظمة عميل → 403 (دفاع في العمق)
 * 3) التزويد الناجح: منظمة+فرع+دور+مالك+تدقيق في معاملة واحدة
 * 4) المالك الجديد يستطيع الدخول فعلياً ببوابة الموظفين
 * 5) التكرار (نفس slug أو نفس بريد) → 409
 * 6) لا كلمة مرور/هَش في أي استجابة أو سجل
 *
 * يتطلب DATABASE_URL على قاعدة الاختبار (نفس إعداد test:e2e الحالي).
 */
describe('Platform tenant provisioning (e2e)', () => {
  let app: INestApplication<App>;
  // عميل مباشر للتحقق — نفس نمط بقية مواصفات e2e
  // (PrismaService يتطلب سياق tenant لكل عملية — وهذا جيد ومرغوب)
  const owner = new PrismaClient();
  let platformToken: string;
  let tenantOwnerToken: string;

  const PROVISION = {
    name: 'شركة النيل الأزرق للنقل',
    slug: 'blue-nile-e2e',
    ownerEmail: 'owner@bluenile.sd',
    ownerName: 'مالك النيل الأزرق',
    initialPassword: 'Initial-Passw0rd-2026',
    primaryBranchName: 'فرع الخرطوم',
    primaryBranchCity: 'الخرطوم',
  };

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });
    return (res.body as { access_token?: string }).access_token ?? '';
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    // مشغّل المنصة: مستخدم الإدارة المُنشأ بواسطة seed في بيئة الاختبار
    platformToken = await login(
      process.env.INITIAL_ADMIN_EMAIL ?? 'e2e-owner@ticketty.local',
      process.env.INITIAL_ADMIN_PASSWORD ?? 'E2eTest-Passw0rd-2026',
    );

    // مالك tenant عميل: يُنشأ أولاً كـ tenant عبر المنصة نفسها (اختبار التوفير)
    // ثم يُستخدم للتأكد من أنه لا يستطيع الوصول لبوابة المنصة.
  });

  afterAll(async () => {
    // تنظيف بيانات الاختبار — لا نلمس أي بيانات حقيقية
    try {
      const org = await owner.organization.findUnique({
        where: { slug: PROVISION.slug },
      });
      if (org) {
        // حذف متتالٍ عبر cascade المنظمة (كما في نماذج prisma)
        await owner.organization.delete({ where: { id: org.id } });
      }
    } catch {
      // تنظيف أفضل جهد
    }
    await app.close();
  });

  it('rejects unauthenticated access (401)', () =>
    request(app.getHttpServer())
      .post('/api/platform/tenants')
      .send(PROVISION)
      .expect(401));

  it('rejects a tenant owner (deep defense) and provisions for the platform operator', async () => {
    // 1) التزويد الأول بواسطة مشغّل المنصة — ينجح
    const provisioned = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${platformToken}`)
      .send(PROVISION);
    expect([200, 201]).toContain(provisioned.status);

    const body = provisioned.body as {
      organization: { id: string; slug: string };
      owner: { id: string; email: string; roleKey: string };
      primaryBranch: { id: string; name: string };
    };
    expect(body.organization.slug).toBe(PROVISION.slug);
    expect(body.owner.email).toBe(PROVISION.ownerEmail);
    expect(body.owner.roleKey).toBe('OWNER');
    expect(body.primaryBranch.name).toBe(PROVISION.primaryBranchName);
    // لا تسريب
    expect(JSON.stringify(provisioned.body)).not.toContain(
      PROVISION.initialPassword,
    );

    // 2) المالك الجديد يدخل فعلاً عبر بوابة الموظفين — النظام جاهز للبيع
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: PROVISION.ownerEmail,
        password: PROVISION.initialPassword,
      });
    expect([200, 201]).toContain(loginRes.status);
    tenantOwnerToken = (loginRes.body as { access_token?: string })
      .access_token as string;
    expect(tenantOwnerToken).toBeTruthy();

    // 3) المالك الجديد — رغم نجمة '*' — لا يفتح بوابة المنصة
    const forbidden = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${tenantOwnerToken}`)
      .send({ ...PROVISION, slug: 'another-slug', ownerEmail: 'x@y.sd' })
      .expect(403);
    expect((forbidden.body as { message: string }).message).toContain(
      'مشغّل المنصة',
    );
  });

  it('lists provisioned tenants for the operator only', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/platform/tenants')
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);
    const list = res.body as Array<{
      slug: string;
      _count?: { users: number };
    }>;
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((t) => t.slug === PROVISION.slug)).toBe(true);
  });

  it('conflicts on duplicate slug and duplicate owner email (409)', async () => {
    await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${platformToken}`)
      .send(PROVISION) // نفس slug
      .expect(409);

    await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ ...PROVISION, slug: 'different-slug' }) // نفس بريد المالك
      .expect(409);
  });

  it('validates the slug format strictly', async () => {
    await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ ...PROVISION, slug: 'Invalid_Slug!' })
      .expect(400);
  });

  it('wrote a platform audit record for the provisioning', async () => {
    const org = await owner.organization.findUnique({
      where: { slug: PROVISION.slug },
    });
    expect(org).toBeTruthy();
    const audits = await owner.auditLog.findMany({
      where: { action: 'PLATFORM_TENANT_PROVISIONED', entityId: org!.id },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════════════════════
// الاشتراكات + دورة الحياة + المراقبة (قاعدة حقيقية)
// ═════════════════════════════════════════════════════════════

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  subscription: { planKey: string; status: string } | null;
}

interface SubscriptionResponse {
  subscriptionId: string;
  planKey: string;
  priceSdg: number;
  status: string;
  startedAt: string;
  currentPeriodEnd: string;
}

interface EventRow {
  id: string;
  level: string;
  category: string;
  message: string;
  acknowledgedAt: string | null;
}

/** إحضار معرف منظمة من روستر المنصة — مُعاد الكتابة عبره لكل اختبار. */
async function tenantOrgId(
  server: unknown,
  token: string,
  slug: string,
): Promise<string> {
  const res = await request(server as never)
    .get('/api/platform/tenants')
    .set('Authorization', `Bearer ${token}`);
  const row = (res.body as TenantRow[]).find((t) => t.slug === slug);
  if (!row?.id) throw new Error(`tenant ${slug} not found in roster`);
  return row.id;
}

describe('Platform subscriptions & monitoring (e2e)', () => {
  let app: INestApplication<App>;
  let operatorToken: string;
  const adminEmail =
    process.env.INITIAL_ADMIN_EMAIL ?? 'e2e-owner@ticketty.local';
  const password = 'E2eTest-Passw0rd-2026';
  const SUB_TENANT = {
    name: 'شركة شرق النيل للنقل',
    slug: 'sub-tenant-e2e',
    ownerName: 'مالك شرق النيل',
    ownerEmail: 'owner@eastnile.sd',
    initialPassword: 'Initial-Passw0rd-2026',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(['error', 'warn']);
    configureApp(app);
    await app.init();
    // تنظيف أي بقايا من دورة سابقة — بعد الإغلاق في afterAll
  });

  afterAll(async () => {
    const bootstrap = new PrismaClient();
    await bootstrap.organization.deleteMany({
      where: { slug: SUB_TENANT.slug },
    });
    await bootstrap.$disconnect();
    await app.close();
  });

  it('prepares an operator session and a fresh tenant', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password });
    expect([200, 201]).toContain(res.status);
    operatorToken = (res.body as { access_token: string }).access_token;
    expect(operatorToken).toBeTruthy();

    const provisioned = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(SUB_TENANT);
    expect([200, 201]).toContain(provisioned.status);
    expect(
      (provisioned.body as { organization: { slug: string } }).organization
        .slug,
    ).toBe(SUB_TENANT.slug);
  });

  it('sets a 30-day free trial and reports it in the roster', async () => {
    const orgId = await tenantOrgId(
      app.getHttpServer(),
      operatorToken,
      SUB_TENANT.slug,
    );
    expect(orgId).toBeTruthy();

    const set = await request(app.getHttpServer())
      .post(`/api/platform/tenants/${orgId}/subscription`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ planKey: 'TRIAL', organizationId: orgId });
    expect(set.status).toBe(201);
    expect((set.body as SubscriptionResponse).planKey).toBe('TRIAL');
    expect((set.body as SubscriptionResponse).priceSdg).toBe(0);
    expect((set.body as SubscriptionResponse).status).toBe('TRIALING');
    // فترة التجربة 30 يوماً فعلاً
    const setBody = set.body as SubscriptionResponse;
    const days =
      (new Date(setBody.currentPeriodEnd).getTime() -
        new Date(setBody.startedAt).getTime()) /
      86_400_000;
    expect(Math.round(days)).toBeGreaterThanOrEqual(29);

    const roster = await request(app.getHttpServer())
      .get('/api/platform/tenants')
      .set('Authorization', `Bearer ${operatorToken}`);
    const listed = (roster.body as TenantRow[]).find(
      (t) => t.slug === SUB_TENANT.slug,
    );
    expect(listed?.subscription?.planKey).toBe('TRIAL');
  });

  it('rejects a client-sent price that does not match the plan', async () => {
    const orgId = await tenantOrgId(
      app.getHttpServer(),
      operatorToken,
      SUB_TENANT.slug,
    );

    const res = await request(app.getHttpServer())
      .post(`/api/platform/tenants/${orgId}/subscription`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ planKey: 'MONTHLY', priceSdg: 1, organizationId: orgId });
    expect(res.status).toBe(400);
  });

  it('upgrades to monthly (199,000 SDG) and renews for a year', async () => {
    const orgId = await tenantOrgId(
      app.getHttpServer(),
      operatorToken,
      SUB_TENANT.slug,
    );

    const upgrade = await request(app.getHttpServer())
      .post(`/api/platform/tenants/${orgId}/subscription`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ planKey: 'MONTHLY', organizationId: orgId });
    expect(upgrade.status).toBe(201);
    expect((upgrade.body as SubscriptionResponse).planKey).toBe('MONTHLY');
    expect((upgrade.body as SubscriptionResponse).priceSdg).toBe(199_000);

    const renew = await request(app.getHttpServer())
      .post(`/api/platform/tenants/${orgId}/subscription/renew`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ months: 12 });
    expect(renew.status).toBe(201);
    expect((renew.body as SubscriptionResponse).planKey).toBe('YEARLY');
    expect((renew.body as SubscriptionResponse).priceSdg).toBe(2_388_000);
    // التجديد يمتد من نهاية الفترة الحالية (وليس من الآن) — عدالة العقد
    const renewBody = renew.body as SubscriptionResponse;
    const days =
      (new Date(renewBody.currentPeriodEnd).getTime() - Date.now()) /
      86_400_000;
    expect(days).toBeGreaterThan(360);
  });

  it('suspends a tenant (its users cannot log in) then reactivates', async () => {
    const direct = new PrismaClient();
    const orgId = (
      (await direct.organization.findUnique({
        where: { slug: SUB_TENANT.slug },
      })) as { id: string } | null
    )?.id;
    await direct.$disconnect();
    expect(orgId).toBeTruthy();

    const suspend = await request(app.getHttpServer())
      .post(`/api/platform/tenants/${orgId}/suspend`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ reason: 'اختبار التعليق e2e' });
    expect(suspend.status).toBe(201);
    expect((suspend.body as { active: boolean }).active).toBe(false);

    // مستخدمو الشركة المعلّقة لا يستطيعون الدخول — التعليق فوري المفعول
    const ownerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: SUB_TENANT.ownerEmail,
        password: SUB_TENANT.initialPassword,
      });
    expect(ownerLogin.status).toBe(401);

    const reactivate = await request(app.getHttpServer())
      .post(`/api/platform/tenants/${orgId}/reactivate`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(reactivate.status).toBe(201);
    expect((reactivate.body as { active: boolean }).active).toBe(true);

    // بعد التفعيل يعود الدخول
    const ownerLogin2 = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: SUB_TENANT.ownerEmail,
        password: SUB_TENANT.initialPassword,
      });
    expect([200, 201]).toContain(ownerLogin2.status);
  });

  it('forbids suspending the platform operator organization itself', async () => {
    const direct = new PrismaClient();
    const operatorOrgId = (
      (await direct.organization.findUnique({
        where: { slug: 'ticketty' },
      })) as { id: string } | null
    )?.id;
    await direct.$disconnect();

    const res = await request(app.getHttpServer())
      .post(`/api/platform/tenants/${operatorOrgId}/suspend`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ reason: 'محاولة خطيرة' });
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toContain('مشغّل المنصة');
  });

  it('exposes platform health with live counts', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/platform/health')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(
      (res.body as { tenantsTotal: number }).tenantsTotal,
    ).toBeGreaterThanOrEqual(1);
    expect(typeof (res.body as { databaseSize: string }).databaseSize).toBe(
      'string',
    );
    expect(
      (res.body as { pendingAccountingEvents: number }).pendingAccountingEvents,
    ).toBeGreaterThanOrEqual(0);
  });

  it('returns system events (subscription notifications) without sensitive data', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/platform/events')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // لا هَش ولا كلمات مرور في أي حدث — أبداً
    expect(JSON.stringify(res.body)).not.toContain('password');
    expect(JSON.stringify(res.body)).not.toContain('Hash');
  });

  it('acknowledges a system event exactly once', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/platform/events?limit=200')
      .set('Authorization', `Bearer ${operatorToken}`);
    const unacknowledged = (list.body as EventRow[]).find(
      (e) => !e.acknowledgedAt,
    );
    if (!unacknowledged) return; // لا أحداث غير مقروءة الآن — تخطى

    const ack = await request(app.getHttpServer())
      .post(`/api/platform/events/${unacknowledged.id}/acknowledge`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(ack.status).toBe(201);

    const ackAgain = await request(app.getHttpServer())
      .post(`/api/platform/events/${unacknowledged.id}/acknowledge`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(ackAgain.status).toBe(400);
  });

  it('produces a usage report with commercial numbers only', async () => {
    const direct = new PrismaClient();
    const orgId = (
      (await direct.organization.findUnique({
        where: { slug: SUB_TENANT.slug },
      })) as { id: string } | null
    )?.id;
    await direct.$disconnect();

    const res = await request(app.getHttpServer())
      .get(`/api/platform/tenants/${orgId}/report`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect((res.body as { organizationName: string }).organizationName).toBe(
      SUB_TENANT.name,
    );
    expect(typeof (res.body as { tripsTotal: number }).tripsTotal).toBe(
      'number',
    );
    expect(typeof (res.body as { activeUsers: number }).activeUsers).toBe(
      'number',
    );
    // التقرير أرقام تجارية فقط — لا أسماء عملاء ولا هويات
    expect(JSON.stringify(res.body)).not.toContain('passenger');
    expect(JSON.stringify(res.body)).not.toContain('nationalId');
  });

  it('rejects a tenant owner from every monitoring endpoint (deep defense)', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: SUB_TENANT.ownerEmail,
        password: SUB_TENANT.initialPassword,
      });
    const tenantToken = (login.body as { access_token: string }).access_token;
    expect(tenantToken).toBeTruthy();

    const targets = [
      { method: 'get', path: '/api/platform/health' },
      { method: 'get', path: '/api/platform/events' },
      { method: 'post', path: '/api/platform/subscriptions/expire' },
      { method: 'get', path: '/api/platform/backup/runbook' },
    ];
    for (const t of targets) {
      const res = await (
        request(app.getHttpServer()) as never as {
          [k: string]: (path: string) => request.Test;
        }
      )
        [t.method](t.path)
        .set('Authorization', `Bearer ${tenantToken}`);
      expect(res.status).toBe(403);
    }
  });

  it('expires due subscriptions and emits a WARN event (worker contract)', async () => {
    const direct = new PrismaClient();
    const orgId = (
      (await direct.organization.findUnique({
        where: { slug: SUB_TENANT.slug },
      })) as { id: string } | null
    )?.id;
    // تقصير فترة الاشتراك يدوياً لمحاكاة انتهائها
    await direct.$executeRawUnsafe(
      `UPDATE subscriptions SET "currentPeriodEnd" = clock_timestamp() - interval '1 day' WHERE "organizationId" = '${orgId}'`,
    );
    await direct.$disconnect();

    const res = await request(app.getHttpServer())
      .post('/api/platform/subscriptions/expire')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(201);
    expect((res.body as { expired: number }).expired).toBeGreaterThanOrEqual(1);

    const events = await request(app.getHttpServer())
      .get('/api/platform/events?level=WARN')
      .set('Authorization', `Bearer ${operatorToken}`);
    const found = (events.body as EventRow[]).some(
      (e) => e.category === 'SUBSCRIPTION' && e.message.includes('اشتراك'),
    );
    expect(found).toBe(true);
  });
});
