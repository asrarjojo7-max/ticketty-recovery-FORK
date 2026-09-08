import 'reflect-metadata';
import { SUBSCRIPTION_POLICY_KEY } from '../decorators/subscription-policy.decorator';
import type { SubscriptionPolicyOptions } from '../decorators/subscription-policy.decorator';

/**
 * اختبار ثابت لآلية سياسة الاشتراك — يمنع إساءة الاستخدام التي
 * حظرها عقد الهندسة §3 صراحةً:
 *  1) كل وسم exempt يجب أن يحمل reason غير فارح (استثناء صريح
 *     ضيق النطاق قابل للمراجعة — لا @SkipSubscriptionCheck عشوائي).
 *  2) لا يجوز أن يكون مسار "صنع التزام مالي جديد" exempt أبداً
 *     (بيع/حجز/اعتماد مصروف/تسوية/ترحيل محاسبي) — القائمة أدناه
 *     مستخرجة حرفياً من عقد الهندسة §1.
 *  3) الحماية الافتراضية fail-closed تُثبت عملياً: كل مسار
 *     مالي في القائمة إما بلا وسم (= full) أو موسوم full صراحة.
 */

import { AccountingController } from '../../accounting/accounting.controller';
import { AdministrationController } from '../../administration/administration.controller';
import { AgentsController } from '../../agents/agents.controller';
import { BookingsController } from '../../bookings/bookings.controller';
import { TicketsController } from '../../bookings/tickets.controller';
import { CustomersController } from '../../customers/customers.controller';
import { DriversController } from '../../drivers/drivers.controller';
import { BusesController } from '../../fleet/buses.controller';
import { SeatTemplatesController } from '../../fleet/seat-templates.controller';
import { ManifestsController } from '../../manifests/manifests.controller';
import { PaymentsController } from '../../payments/payments.controller';
import { ReportsController } from '../../reports/reports.controller';
import { RoutesController } from '../../routes/routes.controller';
import { SettlementsController } from '../../settlements/settlements.controller';
import { TripsController } from '../../trips/trips.controller';
import { ExpensesController } from '../../expenses/expenses.controller';

const CONTROLLERS = [
  AccountingController,
  AdministrationController,
  AgentsController,
  BookingsController,
  TicketsController,
  CustomersController,
  DriversController,
  BusesController,
  SeatTemplatesController,
  ManifestsController,
  PaymentsController,
  ReportsController,
  RoutesController,
  SettlementsController,
  TripsController,
  ExpensesController,
];

/** المسارات التي تخلق التزاماً مالياً جديداً (عقد §1) — إما بلا وسم
 *  (= full افتراضياً) أو full صراحة؛ exempt هنا = فشل البناء. */
const MONEY_ROUTE_KEYS = new Set([
  'AccountingController.createAccount',
  'AccountingController.createPeriod',
  'AccountingController.closePeriod',
  'AccountingController.createJournal',
  'AccountingController.configurePolicy',
  'AccountingController.processNextEvent',
  'AccountingController.requeueEvent',
  'AccountingController.processEvent',
  'AccountingController.postBusinessEvent',
  'AccountingController.createEntry',
  'AccountingController.postEntry',
  'AccountingController.reverseEntry',
  'BookingsController.hold',
  'BookingsController.release',
  'BookingsController.create',
  'ExpensesController.create',
  'ExpensesController.update',
  'ExpensesController.approve',
  'ExpensesController.adjust',
  'ExpensesController.remove',
  'SettlementsController.generate',
  'SettlementsController.settle',
]);

interface RouteEntry {
  controller: string;
  handler: string;
  policy: SubscriptionPolicyOptions | undefined;
}

type ControllerCtor = new (...args: never[]) => object;

function scanController(ControllerClass: ControllerCtor): RouteEntry[] {
  // لا نستدعي الـ constructor إطلاقاً — نقرأ prototype فقط.
  const prototype = ControllerClass.prototype as Record<string, unknown> & {
    constructor: { name: string };
  };
  const controllerName = prototype.constructor.name;
  const classPolicy = Reflect.getMetadata(
    SUBSCRIPTION_POLICY_KEY,
    prototype.constructor,
  ) as SubscriptionPolicyOptions | undefined;

  return Object.getOwnPropertyNames(prototype)
    .filter(
      (name) => name !== 'constructor' && typeof prototype[name] === 'function',
    )
    .map((handler) => {
      const methodPolicy = Reflect.getMetadata(
        SUBSCRIPTION_POLICY_KEY,
        prototype[handler] as object,
      ) as SubscriptionPolicyOptions | undefined;
      return {
        controller: controllerName,
        handler,
        policy: methodPolicy ?? classPolicy,
      };
    });
}

const allRoutes = CONTROLLERS.flatMap(scanController);

describe('subscription policy static invariants (Engineering Contract §3)', () => {
  it('scanned a meaningful number of routes across all controllers', () => {
    expect(allRoutes.length).toBeGreaterThan(40);
  });

  it('every exempt annotation carries a documented non-empty reason', () => {
    const offenders = CONTROLLERS.flatMap((c) => {
      const prototype = (c as unknown as ControllerCtor).prototype as Record<
        string,
        unknown
      > & { constructor: { name: string } };
      const found: string[] = [];
      const check = (
        policy: SubscriptionPolicyOptions | undefined,
        where: string,
      ) => {
        if (
          policy?.mode === 'exempt' &&
          (!policy.reason || policy.reason.trim() === '')
        ) {
          found.push(`${prototype.constructor.name}.${where}`);
        }
      };
      check(
        Reflect.getMetadata(SUBSCRIPTION_POLICY_KEY, prototype.constructor) as
          SubscriptionPolicyOptions | undefined,
        'class',
      );
      for (const name of Object.getOwnPropertyNames(prototype)) {
        if (name === 'constructor') continue;
        check(
          Reflect.getMetadata(
            SUBSCRIPTION_POLICY_KEY,
            prototype[name] as object,
          ) as SubscriptionPolicyOptions | undefined,
          name,
        );
      }
      return found;
    });
    expect(offenders).toEqual([]);
  });

  it('never marks a money-creating route as exempt (fail-closed core)', () => {
    const offenders = allRoutes.filter(
      (route) =>
        MONEY_ROUTE_KEYS.has(`${route.controller}.${route.handler}`) &&
        route.policy?.mode === 'exempt',
    );
    expect(offenders.map((r) => `${r.controller}.${r.handler}`)).toEqual([]);
  });

  it('money-creating routes resolve to full policy (explicit or fail-closed default)', () => {
    const moneyRoutes = allRoutes.filter((route) =>
      MONEY_ROUTE_KEYS.has(`${route.controller}.${route.handler}`),
    );
    // كل المسارات المالية المذكورة موجودة فعلاً بعد أي إعادة تسمية
    expect(moneyRoutes.length).toBe(MONEY_ROUTE_KEYS.size);
    for (const route of moneyRoutes) {
      expect(route.policy?.mode ?? 'full').toBe('full');
    }
  });
});
