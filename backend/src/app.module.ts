import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AccountingModule } from './accounting/accounting.module';
import { AdministrationModule } from './administration/administration.module';
import { AgentsModule } from './agents/agents.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './common/audit/audit.module';
import { BookingsModule } from './bookings/bookings.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { CustomersModule } from './customers/customers.module';
import { ExpensesModule } from './expenses/expenses.module';
import { DriversModule } from './drivers/drivers.module';
import { FleetModule } from './fleet/fleet.module';
import { HealthModule } from './health/health.module';
import { RequestContextMiddleware } from './common/http/request-context.middleware';
import { TenantRlsInterceptor } from './common/interceptors/tenant-rls.interceptor';
import { ManifestsModule } from './manifests/manifests.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { RoutesModule } from './routes/routes.module';
import { SettlementsModule } from './settlements/settlements.module';
import { TripsModule } from './trips/trips.module';
import { validateEnvironment } from './config/env.validation';

function jwtOptions(config: ConfigService): JwtModuleOptions {
  const issuer = config.getOrThrow<string>('JWT_ISSUER');
  const audience = config.getOrThrow<string>('JWT_AUDIENCE');

  return {
    secret: config.getOrThrow<string>('JWT_SECRET'),
    signOptions: {
      algorithm: 'HS256',
      expiresIn: config.getOrThrow<string>('JWT_EXPIRES_IN') as never,
      issuer,
      audience,
    },
    verifyOptions: {
      algorithms: ['HS256'],
      issuer,
      audience,
    },
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    HealthModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: jwtOptions,
    }),
    AuthModule,
    AuditModule,
    AccountingModule,
    AdministrationModule,
    CustomersModule,
    RoutesModule,
    FleetModule,
    DriversModule,
    TripsModule,
    BookingsModule,
    PaymentsModule,
    AgentsModule,
    ExpensesModule,
    SettlementsModule,
    ManifestsModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantRlsInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
