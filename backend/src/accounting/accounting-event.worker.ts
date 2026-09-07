import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from './accounting.service';

@Injectable()
export class AccountingEventWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountingEventWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly workerId = `accounting:${process.pid}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('ACCOUNTING_WORKER_ENABLED') !== 'true') return;
    const configured = Number(
      this.config.get<string>('ACCOUNTING_WORKER_INTERVAL_MS') ?? '5000',
    );
    const interval =
      Number.isInteger(configured) && configured >= 1000 ? configured : 5000;
    this.timer = setInterval(() => void this.runOnce(), interval);
    this.timer.unref();
    void this.runOnce();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      const claimed = await this.prisma.claimAccountingEvent(this.workerId);
      if (!claimed) return false;
      const user: AuthUser = {
        sub: this.workerId,
        orgId: claimed.organizationId,
        branchId: null,
        name: 'Accounting Worker',
        email: 'accounting-worker@ticketty.internal',
        roleKey: 'SYSTEM_WORKER',
        permissions: ['accounting.post'],
      };
      try {
        await this.prisma.withTenantContext(claimed.organizationId, () =>
          this.accounting.processEvent(user, claimed.id),
        );
      } catch (error) {
        await this.prisma.withTenantContext(claimed.organizationId, () =>
          this.accounting.markEventFailed(user, claimed.id, error),
        );
        this.logger.warn(`Accounting event ${claimed.id} failed`);
      }
      return true;
    } finally {
      this.running = false;
    }
  }
}
