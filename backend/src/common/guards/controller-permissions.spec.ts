import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AccountingController } from '../../accounting/accounting.controller';
import { AdministrationController } from '../../administration/administration.controller';
import { AgentsController } from '../../agents/agents.controller';
import { BookingsController } from '../../bookings/bookings.controller';
import { TicketsController } from '../../bookings/tickets.controller';
import { CustomersController } from '../../customers/customers.controller';
import { DriversController } from '../../drivers/drivers.controller';
import { ExpensesController } from '../../expenses/expenses.controller';
import { BusesController } from '../../fleet/buses.controller';
import { SeatTemplatesController } from '../../fleet/seat-templates.controller';
import { ManifestsController } from '../../manifests/manifests.controller';
import { PaymentsController } from '../../payments/payments.controller';
import { PlatformController } from '../../platform/platform.controller';
import { ReportsController } from '../../reports/reports.controller';
import { RoutesController } from '../../routes/routes.controller';
import { SettlementsController } from '../../settlements/settlements.controller';
import { TripsController } from '../../trips/trips.controller';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PLATFORM_SCOPE_KEY } from '../decorators/platform-scope.decorator';

/**
 * STATIC AUTHORIZATION MATRIX (Phase 3 — الطبقة 1)
 * =================================================
 * عقد الهندسة §10: لكل endpoint صلاحية معلنة، وللأدوار المرجعية
 * نطاق معروف. هذا الـ spec يشتق مصفوفة role×route آلياً من
 * الـ metadata ويقارنها بتعريف الأدوار المرجعي (نفس مصفوفة
 * prisma/seed.ts — مصدر الحقيقة الوحيد) — ويفرض denied-paths
 * صريحة لا يجوز أن تنفتح أبداً (مقاومة الترقي).
 *
 * ملاحظة على التكرار المتعمد: تعريف ROLE_PERMISSIONS هنا نسخة
 * من seed.ts. لو تغير seed دون تحديث هذا الـ spec يفشل البناء —
 * وهذا مقصود: يفرض قراراً واعياً عن أي تغيير في نموذج الأدوار.
 * (runtime يفحصه authorization-matrix.e2e-spec.ts.)
 */

const BUSINESS_CONTROLLERS = [
  AccountingController, // كان مفقوداً في النسخة القديمة — المصفوفة كشفته
  AdministrationController,
  AgentsController,
  BookingsController,
  TicketsController,
  CustomersController,
  DriversController,
  ExpensesController,
  BusesController,
  SeatTemplatesController,
  ManifestsController,
  PaymentsController,
  PlatformController,
  ReportsController,
  RoutesController,
  SettlementsController,
  TripsController,
];

// ─── تعريف الأدوار المرجعي (نسخة seed) ─────────────────────────────

const READ_ALL = [
  'customers.read',
  'routes.read',
  'fleet.read',
  'trips.read',
  'bookings.read',
  'tickets.read',
  'payments.read',
  'agents.read',
  'expenses.read',
  'settlements.read',
  'manifests.read',
  'reports.read',
  'accounting.read',
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: ['*'],
  OPS_MANAGER: [
    ...READ_ALL,
    'routes.write',
    'fleet.write',
    'trips.write',
    'manifests.write',
  ],
  FINANCE: [
    ...READ_ALL,
    'payments.write',
    'agents.write',
    'expenses.write',
    'expenses.approve',
    'settlements.write',
    'accounting.write',
    'accounting.post',
    'accounting.close',
  ],
  STATION_MANAGER: [
    ...READ_ALL,
    'bookings.write',
    'tickets.write',
    'customers.write',
    'payments.write',
    'manifests.write',
  ],
  SELLER: [
    'trips.read',
    'bookings.read',
    'bookings.write',
    'tickets.read',
    'tickets.write',
    'customers.read',
    'customers.write',
    'manifests.read',
    'payments.read',
  ],
  AGENT: [
    'trips.read',
    'bookings.read.own',
    'bookings.write.own',
    'tickets.read.own',
    'tickets.write.own',
    'customers.read',
    'customers.write',
    'payments.read.own',
    'agents.read.own',
    'settlements.read.own',
  ],
  VIEWER: [...READ_ALL],
};

// ─── اشتقاق المصفوفة من الـ metadata ────────────────────────────────

interface RouteSpec {
  controller: string;
  method: string;
  path: string;
  permissions: string[];
  platformScope: boolean;
}

function scanRoutes(
  ControllerClass: (typeof BUSINESS_CONTROLLERS)[number],
): RouteSpec[] {
  const prototype = ControllerClass.prototype as unknown as Record<
    string,
    unknown
  > & { constructor: { name: string } };
  const controllerName = prototype.constructor.name;
  const basePath = Reflect.getMetadata(
    PATH_METADATA,
    prototype.constructor,
  ) as string;

  return Object.getOwnPropertyNames(prototype)
    .filter(
      (name) => name !== 'constructor' && typeof prototype[name] === 'function',
    )
    .map((handlerName) => {
      const handler = prototype[handlerName] as object;
      const hasMethod = Reflect.hasMetadata(METHOD_METADATA, handler);
      if (!hasMethod) return null;
      // NestJS يخزن الـ method كرقم enum (GET=0 POST=1 PUT=2
      // DELETE=3 PATCH=4) — نحوله للاسم حتى تفحص المصفوفة نمطاً
      // نصياً مستقراً.
      const methodNumber = Reflect.getMetadata(
        METHOD_METADATA,
        handler,
      ) as number;
      const METHOD_NAMES: Record<number, string> = {
        0: 'GET',
        1: 'POST',
        2: 'PUT',
        3: 'DELETE',
        4: 'PATCH',
      };
      const method = METHOD_NAMES[methodNumber] ?? String(methodNumber);
      const handlerPath =
        (Reflect.getMetadata(PATH_METADATA, handler) as string) ?? '';
      const permissions = (Reflect.getMetadata(PERMISSIONS_KEY, handler) ??
        []) as string[];
      const platformScope =
        Reflect.getMetadata(PLATFORM_SCOPE_KEY, handler) === true;
      // NestJS: مسار الجذر "/" — نبني المسار الكامل نظيفاً بلا //
      const segments = [basePath, handlerPath].filter(
        (p) => p && p !== '' && p !== '/',
      );
      const full = segments.join('/');
      return {
        controller: controllerName,
        method,
        path: `/api/${full}`,
        permissions,
        platformScope,
      } satisfies RouteSpec;
    })
    .filter((r): r is RouteSpec => r !== null);
}

const ALL_ROUTES = BUSINESS_CONTROLLERS.flatMap(scanRoutes);

// نفس منطق PermissionsGuard — يجب أن يبقى متطابقاً سلوكياً.
function hasPermission(perms: string[], required: string): boolean {
  if (perms.includes('*') || perms.includes(required)) return true;
  const [domain] = required.split('.');
  return perms.includes(`${domain}.*`);
}

function roleCan(roleKey: string, route: RouteSpec): boolean {
  const perms = ROLE_PERMISSIONS[roleKey] ?? [];
  if (route.platformScope && !perms.includes('platform.admin')) return false;
  return route.permissions.some((r) => hasPermission(perms, r));
}

// ─── الفحوص ─────────────────────────────────────────────────────────

describe('static authorization matrix (metadata-derived) — Phase 3 layer 1', () => {
  it('every business route declares at least one permission (fail-closed)', () => {
    const offenders = ALL_ROUTES.filter((r) => r.permissions.length === 0);
    expect(offenders.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it('platform routes are always PlatformScope + platform.admin (boundary)', () => {
    const platformRoutes = ALL_ROUTES.filter(
      (r) => r.controller === 'PlatformController',
    );
    expect(platformRoutes.length).toBeGreaterThan(5);
    for (const route of platformRoutes) {
      expect(route.platformScope).toBe(true);
      expect(route.permissions).toContain('platform.admin');
    }
  });

  it('no non-platform route carries platform.admin (boundary leak)', () => {
    const offenders = ALL_ROUTES.filter(
      (r) =>
        r.controller !== 'PlatformController' &&
        r.permissions.includes('platform.admin'),
    );
    expect(offenders.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  // ─── المصفوفة المشتقة: كل دور لا يفتح أكثر من تعريفه ────────

  describe('derived matrix vs reference roles', () => {
    const cases: Array<[string, RegExp, boolean]> = [
      // [دور, نمط مسار, متوقع مسموح؟]
      ['SELLER', /^POST \/api\/bookings$/, true],
      ['SELLER', /^POST \/api\/bookings\/.+\/cancel$/, true],
      ['SELLER', /^POST \/api\/expenses/, false],
      ['SELLER', /^POST \/api\/administration\/users$/, false],
      ['SELLER', /^POST \/api\/administration\/roles$/, false],
      ['SELLER', /^GET \/api\/reports\/dashboard$/, false],
      ['SELLER', /^POST \/api\/accounting/, false],
      // FINANCE مالية كاملة بلا تشغيل
      ['FINANCE', /^POST \/api\/accounting\/entries$/, true],
      ['FINANCE', /^POST \/api\/expenses\/.+\/approve$/, true],
      ['FINANCE', /^POST \/api\/settlements\/generate$/, true],
      ['FINANCE', /^POST \/api\/trips$/, false],
      ['FINANCE', /^POST \/api\/buses$/, false],
      // OPS تشغيلي بلا مالية/إدارة
      ['OPS_MANAGER', /^POST \/api\/trips$/, true],
      ['OPS_MANAGER', /^POST \/api\/buses$/, true],
      ['OPS_MANAGER', /^POST \/api\/accounting\/entries$/, false],
      ['OPS_MANAGER', /^POST \/api\/administration\/users$/, false],
      // STATION مبيعات بلا محاسبة
      ['STATION_MANAGER', /^POST \/api\/bookings$/, true],
      ['STATION_MANAGER', /^POST \/api\/manifests\/generate$/, true],
      ['STATION_MANAGER', /^POST \/api\/accounting\/entries$/, false],
      // VIEWER قراءة فقط
      ['VIEWER', /^GET \/api\/trips$/, true],
      ['VIEWER', /^GET \/api\/accounting\/accounts$/, true],
      ['VIEWER', /^POST \/api\/trips$/, false],
      ['VIEWER', /^POST \/api\/bookings$/, false],
      // AGENT own-scope: الحارس يفهم .own
      ['AGENT', /^GET \/api\/bookings$/, true],
      ['AGENT', /^POST \/api\/accounting\/entries$/, false],
      ['AGENT', /^POST \/api\/administration\/users$/, false],
      // OWNER النجمة تفتح كل شيء داخل org
      ['OWNER', /^POST \/api\/bookings$/, true],
      ['OWNER', /^POST \/api\/accounting\/entries$/, true],
      ['OWNER', /^POST \/api\/administration\/users$/, true],
      // لكن النجمة لا تفتح المنصة — حكرية platform.admin
      ['OWNER', /^POST \/api\/platform\/tenants$/, false],
    ];

    it.each(cases)('%s on %s → allowed=%s', (role, pattern, expected) => {
      const routes = ALL_ROUTES.filter((r) =>
        pattern.test(`${r.method} ${r.path}`),
      );
      // النمط يجب أن يطابق مساراً واحداً على الأقل — وإلا فالفحص
      // نفسه تعطل (مسار تغير اسمه) ونريد أن نعرف.
      expect(routes.length).toBeGreaterThan(0);
      const anyAllowed = routes.some((r) => roleCan(role, r));
      expect(anyAllowed).toBe(expected);
    });
  });

  // ─── مقاومة الترقي ─────────────────────────────────────────

  it('user/role administration requires settings.write — OWNER only', () => {
    const adminRoutes = ALL_ROUTES.filter(
      (r) =>
        /^\/api\/administration\/(users|roles)/.test(r.path) &&
        r.method === 'POST',
    );
    expect(adminRoutes.length).toBeGreaterThanOrEqual(2);
    for (const route of adminRoutes) {
      expect(route.permissions).toContain('settings.write');
      const holders = Object.keys(ROLE_PERMISSIONS).filter((role) =>
        roleCan(role, route),
      );
      expect(holders).toEqual(['OWNER']);
    }
  });

  it('platform renew is never grantable to tenant roles (star does not open platform)', () => {
    const renew = ALL_ROUTES.find((r) =>
      /platform\/tenants\/.+\/subscription\/renew/.test(r.path),
    );
    expect(renew).toBeDefined();
    expect(renew!.platformScope).toBe(true);
    const tenantRoles = [
      'OPS_MANAGER',
      'FINANCE',
      'STATION_MANAGER',
      'SELLER',
      'AGENT',
      'VIEWER',
    ];
    for (const role of tenantRoles) {
      expect(roleCan(role, renew!)).toBe(false);
    }
  });
});
