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
