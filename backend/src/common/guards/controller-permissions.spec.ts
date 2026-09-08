import { METHOD_METADATA } from '@nestjs/common/constants';
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

const BUSINESS_CONTROLLERS = [
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

describe('business controller permission metadata', () => {
  it.each(BUSINESS_CONTROLLERS)(
    '%s declares permissions on every route',
    (ControllerClass) => {
      const prototype = ControllerClass.prototype as object;
      const routeMethods = Object.getOwnPropertyNames(prototype).filter(
        (name) =>
          name !== 'constructor' &&
          Reflect.hasMetadata(
            METHOD_METADATA,
            (prototype as Record<string, unknown>)[name] as object,
          ),
      );

      expect(routeMethods.length).toBeGreaterThan(0);
      for (const methodName of routeMethods) {
        const handler = (prototype as Record<string, unknown>)[
          methodName
        ] as object;
        const permissions = Reflect.getMetadata(
          PERMISSIONS_KEY,
          handler,
        ) as unknown;
        expect(Array.isArray(permissions)).toBe(true);
        expect((permissions as string[]).length).toBeGreaterThan(0);
      }
    },
  );
});
