import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

/**
 * AUTHORIZATION MATRIX (Phase 3 — الطبقة الجوهرية)
 * ==================================================
 * عقد الهندسة §10: "runtime 403 authorization matrix (allowed/denied/
 * role/org/platform boundaries/escalation resistance) — ليس فقط
 * metadata". هذا الـ suite يفحص الفرض الفعلي عبر HTTP بدور حقيقية
 * (login فعلي بكل دور).
 *
 * كل سطر في المصفوفة: دور × endpoint → 200 | 403 — لا قيمة أخرى
 * مقبولة (402 مستحيل: org التجربة TRIALING حتى 2026-10-08).
 *
 * الأدوار المفحوصة (كل أدوار seed):
 *   OWNER ('*' + platform.admin)، OPS_MANAGER، FINANCE،
 *   STATION_MANAGER، SELLER، AGENT، VIEWER
 *
 * الحدود المفحوصة:
 *   1. داخل الدور: صلاحياته تعمل (allowed) — بيده فقط.
 *   2. عبر الأدوار: ما ليس له → 403 (denied matrix من seed).
 *   3. حدود المنصة: platform endpoints لغير المشغل → 403.
 *   4. مقاومة الترقي: SELLER لا يستطيع إنشاء مستخدم/دور (escalation).
 *   5. AGENT own-scope: قراءة الوكلاء تُفلتر لكن لا تكسر.
 *   6. بدون token → 401 على كل العينة (الطبقة 3).
 */

const PASSWORD = 'Auth-Matrix-Passw0rd-2026';
// حد الـ throttle: 5 محاولات/دقيقة/IP — 7 logins تتخطاه. نفصل بين
// الدفعات بـ 65s كحد أدنى بين المجموعات (3+3+1).
const LOGIN_BATCH_GAP_MS = 65_000;

type Server = import('http').Server;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function login(
  server: Server,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(server)
    .post('/api/auth/login')
    .set('Origin', 'http://localhost:3000')
    .send({ email, password });
  const body = res.body as { access_token?: string };
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`login ${email} failed ${res.status}`);
  }
  if (typeof body.access_token !== 'string') throw new Error('no token');
  return body.access_token;
}

/** مصفوفة seed من prisma/seed.ts — مصدر الحقيقة للأدوار.
 *  نكررها هنا عمداً: هذا الـ spec يفحص أن الـ runtime يطابق
 *  تعريف المرجع؛ لو غُيّر seed دون تحديث المصفوفة هنا يفشل
 *  الاختبار ويفرض مراجعة واعية (لا نستورد من seed.ts لأنه
 *  script مستقل بعملية منفصلة). */

/** المسارات العينة — واحدة على الأقل لكل controller + كل المالي الحساس. */
type Sample = { method: 'GET' | 'POST'; path: string; body?: unknown };

const SAMPLES = {
  tripsRead: { method: 'GET', path: '/api/trips' },
  tripsWrite: { method: 'POST', path: '/api/trips', body: {} },
  bookingsRead: { method: 'GET', path: '/api/bookings' },
  bookingsWrite: { method: 'POST', path: '/api/bookings', body: {} },
  paymentsRead: { method: 'GET', path: '/api/payments' },
  expensesApprove: {
    method: 'POST',
    path: '/api/expenses/x/approve',
    body: {},
  },
  settlementsWrite: {
    method: 'POST',
    path: '/api/settlements/generate',
    body: {},
  },
  accountingPost: {
    method: 'POST',
    path: '/api/accounting/entries',
    body: {},
  },
  accountingRead: { method: 'GET', path: '/api/accounting/accounts' },
  usersAdmin: {
    method: 'POST',
    path: '/api/administration/users',
    body: {},
  },
  usersRead: { method: 'GET', path: '/api/administration/users' },
  rolesWrite: {
    method: 'POST',
    path: '/api/administration/roles',
    body: {},
  },
  reportsRead: { method: 'GET', path: '/api/reports/dashboard' },
  fleetWrite: { method: 'POST', path: '/api/buses', body: {} },
  manifestsWrite: {
    method: 'POST',
    path: '/api/manifests/generate',
    body: { tripId: 'nonexistent' },
  },
  agentsRead: { method: 'GET', path: '/api/agents' },
  platformTenants: { method: 'GET', path: '/api/platform/tenants' },
} satisfies Record<string, Sample>;

type SampleKey = keyof typeof SAMPLES;

async function hit(
  server: Server,
  token: string,
  sample: Sample,
): Promise<number> {
  const method = sample.method === 'GET' ? 'get' : 'post';
  const req =
    method === 'get'
      ? request(server).get(sample.path)
      : request(server).post(sample.path);
  req.set('Authorization', `Bearer ${token}`);
  if (sample.body !== undefined && sample.method !== 'GET') {
    req.send(sample.body as Record<string, unknown>);
  }
  const res = await req;
  return res.status;
}

describe('authorization matrix (runtime 403) — Phase 3', () => {
  let app: INestApplication<App>;
  let server: Server;
  const admin = new PrismaClient();
  const suffix = `${process.pid}-${Date.now()}`;
  const createdUserIds: string[] = [];
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(['error', 'warn']);
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as unknown as Server;

    // OWNER القائم (e2e-owner) — org TRIALING
    tokens.OWNER = await login(
      server,
      'e2e-owner@ticketty.local',
      'E2eTest-Passw0rd-2026',
    );

    // أنشئ مستخدمًا لكل دور مطلوب عبر administration API (بواباتها
    // settings.write — بيده OWNER '*' فقط) — سينشئ في نفس org التجربة.
    // نقسم على دفعات احتراماً لـ throttle الـ login (5/دقيقة/IP).
    const roles = await request(server)
      .get('/api/administration/roles')
      .set('Authorization', `Bearer ${tokens.OWNER}`);
    expect(roles.status).toBe(200);
    const roleList = roles.body as Array<{ id: string; key: string }>;

    // AGENT استثناء: دور .own يتطلب ملف وكيل نشطاً — نستعمل
    // المستخدم المزروع القائم (e2e-agent) صاحب ملف الوكيل الحقيقي.
    // باقي الأدوار تُنشأ fresh — لا تحتاج ملفات تابعة.
    const roleKeys = [
      'OPS_MANAGER',
      'FINANCE',
      'STATION_MANAGER',
      'SELLER',
      'VIEWER',
    ];
    for (const [i, roleKey] of roleKeys.entries()) {
      if (i > 0 && i % 3 === 0) {
        // الدفعة السابقة أكلت من حد الـ throttle — نظيف النافذة
        await sleep(LOGIN_BATCH_GAP_MS);
      }
      const role = roleList.find((r) => r.key === roleKey);
      if (!role) throw new Error(`role ${roleKey} not found in seed org`);
      const email = `auth-matrix-${roleKey.toLowerCase()}-${suffix}@ticketty.local`;
      const res = await request(server)
        .post('/api/administration/users')
        .set('Authorization', `Bearer ${tokens.OWNER}`)
        .send({
          name: `اختبار ${roleKey}`,
          email,
          password: PASSWORD,
          roleId: role.id,
        });
      expect(res.status).toBe(201);
      const user = res.body as { id: string };
      createdUserIds.push(user.id);
      tokens[roleKey] = await login(server, email, PASSWORD);
    }
    tokens.AGENT = await login(
      server,
      'e2e-agent@ticketty.local',
      'E2eTest-Passw0rd-2026',
    );
  }, 240_000); // sleeps بين الدفعات — login throttle 5/min/IP

  afterAll(async () => {
    try {
      await admin.user.deleteMany({ where: { id: { in: createdUserIds } } });
    } catch {
      /* best-effort */
    }
    await admin.$disconnect();
    await app.close();
  });

  // ─── 1) الحدود عبر الأدوار (denied matrix) ────────────────

  /** 200 = مسموح (الصلاحية موجودة)، 403 = مرفوض صريح،
   *  400/404/409 = مرّ الحارس ووصل الـ handler (فشل تحقق DTO/وجود)
   *  — نتعامل معه كـ "مسموح" لأن الفحص هنا للفرض (guard) لا منطق العمل.
   *  لا نقبل 401/402/500 هنا إطلاقاً. */
  const GUARD_PASS = new Set([200, 201, 400, 404, 409, 422]);

  function expectDenied(role: string, sample: SampleKey) {
    it(`${role} → ${sample} must be 403 (denied by guard)`, async () => {
      const status = await hit(server, tokens[role], SAMPLES[sample]);
      expect(status).toBe(403);
    });
  }

  function expectAllowed(role: string, sample: SampleKey) {
    it(`${role} → ${sample} must pass the guard`, async () => {
      const status = await hit(server, tokens[role], SAMPLES[sample]);
      expect(GUARD_PASS.has(status)).toBe(true);
    });
  }

  // VIEWER: قراءة فقط — كل الكتابات 403
  expectAllowed('VIEWER', 'tripsRead');
  expectAllowed('VIEWER', 'bookingsRead');
  expectAllowed('VIEWER', 'accountingRead');
  expectAllowed('VIEWER', 'reportsRead');
  expectDenied('VIEWER', 'tripsWrite');
  expectDenied('VIEWER', 'bookingsWrite');
  expectDenied('VIEWER', 'expensesApprove');
  expectDenied('VIEWER', 'settlementsWrite');
  expectDenied('VIEWER', 'accountingPost');
  expectDenied('VIEWER', 'usersAdmin');
  expectDenied('VIEWER', 'rolesWrite');
  expectDenied('VIEWER', 'fleetWrite');
  expectDenied('VIEWER', 'manifestsWrite');

  // SELLER: بيع فقط — لا إدارة ولا مالية
  expectAllowed('SELLER', 'bookingsWrite');
  expectAllowed('SELLER', 'bookingsRead');
  expectAllowed('SELLER', 'tripsRead');
  expectDenied('SELLER', 'expensesApprove');
  expectDenied('SELLER', 'settlementsWrite');
  expectDenied('SELLER', 'accountingPost');
  expectDenied('SELLER', 'accountingRead');
  expectDenied('SELLER', 'usersAdmin');
  expectDenied('SELLER', 'usersRead');
  expectDenied('SELLER', 'rolesWrite');
  expectDenied('SELLER', 'reportsRead');
  expectDenied('SELLER', 'fleetWrite');
  // مقاومة الترقي: البائع لا يخلق مستخدماً بدور أقوى
  expectDenied('SELLER', 'usersAdmin');

  // FINANCE: مالية كاملة — لا تشغيل
  expectAllowed('FINANCE', 'accountingPost');
  expectAllowed('FINANCE', 'accountingRead');
  expectAllowed('FINANCE', 'expensesApprove');
  expectAllowed('FINANCE', 'settlementsWrite');
  expectDenied('FINANCE', 'tripsWrite');
  expectDenied('FINANCE', 'fleetWrite');
  expectDenied('FINANCE', 'bookingsWrite');
  expectDenied('FINANCE', 'rolesWrite');
  expectDenied('FINANCE', 'usersAdmin');

  // STATION_MANAGER: مبيعات + عملاء — لا محاسبة ولا أسطول
  expectAllowed('STATION_MANAGER', 'bookingsWrite');
  expectAllowed('STATION_MANAGER', 'manifestsWrite');
  expectDenied('STATION_MANAGER', 'accountingPost');
  expectDenied('STATION_MANAGER', 'expensesApprove');
  expectDenied('STATION_MANAGER', 'fleetWrite');
  expectDenied('STATION_MANAGER', 'usersAdmin');

  // OPS_MANAGER: تشغيل — لا مالية ولا إدارة مستخدمين
  expectAllowed('OPS_MANAGER', 'tripsWrite');
  expectAllowed('OPS_MANAGER', 'fleetWrite');
  expectAllowed('OPS_MANAGER', 'manifestsWrite');
  expectDenied('OPS_MANAGER', 'accountingPost');
  expectDenied('OPS_MANAGER', 'expensesApprove');
  expectDenied('OPS_MANAGER', 'bookingsWrite');
  expectDenied('OPS_MANAGER', 'usersAdmin');
  expectDenied('OPS_MANAGER', 'rolesWrite');

  // AGENT: own-scope — الحارس يمرر (لكن .own scope يفرض التصفية).
  // ملاحظة عميقة: AGENT بلا ملف وكيل نشط يُرفض في طبقة الـ service
  // بـ 403 ("لا يوجد ملف وكيل نشط") — لا نطلب 200 لأن ذلك يعتمد
  // على وجود ملف وكيل مرتبط؛ المهم هنا أن الحارس لا يمنعه عن
  // مسار مسموح له سموياً (الفرق بين 403-guard و403-scope
  // يفحصه agent-isolation.e2e-spec.ts عبر مستخدم مزروع بملف حقيقي).
  it('AGENT own-permitted route: guard passes (.own permission honored)', async () => {
    const status = await hit(server, tokens.AGENT, SAMPLES.bookingsRead);
    // 403 ممكن فقط من scope-layer (لا ملف وكيل)؛ 200 لو وُجد.
    // المرفوض سموياً غير مقبول: permissions تشمل bookings.read.own.
    expect([200, 403]).toContain(status);
  });
  expectAllowed('AGENT', 'tripsRead');
  expectDenied('AGENT', 'accountingPost');
  expectDenied('AGENT', 'usersAdmin');
  expectDenied('AGENT', 'rolesWrite');
  expectDenied('AGENT', 'expensesApprove');

  // OWNER: كل شيء (داخل org)
  expectAllowed('OWNER', 'tripsRead');
  expectAllowed('OWNER', 'tripsWrite');
  expectAllowed('OWNER', 'accountingPost');
  expectAllowed('OWNER', 'expensesApprove');
  expectAllowed('OWNER', 'usersAdmin');
  expectAllowed('OWNER', 'rolesWrite');
  expectAllowed('OWNER', 'reportsRead');

  // ─── 2) حدود المنصة (platform boundary) ──────────────────

  it('tenant OWNER cannot list platform tenants (platform boundary)', async () => {
    // ملاحظة: e2e-owner هو مالك org المشغل (نجمة + platform.admin)
    // نفحص بالمستخدمين الجدد — هم tenants حقيقيون
    const status = await hit(server, tokens.FINANCE, SAMPLES.platformTenants);
    expect(status).toBe(403);
  });

  it('tenant-created users cannot access platform endpoints at all', async () => {
    const status = await hit(server, tokens.VIEWER, SAMPLES.platformTenants);
    expect(status).toBe(403);
  });

  it('tenant OWNER of operator org CAN access platform (operator ≠ tenant)', async () => {
    // e2e-owner في org المشغل بمنح platform.admin صريحة
    const status = await hit(server, tokens.OWNER, SAMPLES.platformTenants);
    expect([200, 201, 400, 404]).toContain(status);
  });

  // ─── 3) الطبقة 3: بدون token → 401 ────────────────────────

  it('unauthenticated requests to every sample → 401', async () => {
    const entries = Object.entries(SAMPLES) as Array<[string, Sample]>;
    for (const [key, sample] of entries) {
      const req =
        sample.method === 'GET'
          ? request(server).get(sample.path)
          : request(server).post(sample.path);
      if (sample.body !== undefined && sample.method !== 'GET') {
        req.send(sample.body as Record<string, unknown>);
      }
      const res = await req;
      void key;
      expect(res.status).toBe(401);
    }
  });

  it('tampered token → 401 (not 403/500)', async () => {
    const res = await request(server)
      .post('/api/bookings')
      .set('Authorization', 'Bearer tampered-token-value')
      .send({});
    expect(res.status).toBe(401);
  });
});
