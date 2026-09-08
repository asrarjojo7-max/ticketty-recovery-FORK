import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { MetricsRegistryService } from '../monitoring/metrics-registry.service';
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
    private readonly metrics: MetricsRegistryService,
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

  /** عمق الطابور للمراقبة — قراءة مجمعة واحدة كل دورة (Phase 6).
   *  دور ticketty_accounting_worker نفسه: لا دور جديد ولا منح
   *  جديدة — الاستعلام SELECT صرف على جدول له SELECT بالفعل. */
  private async observeQueueDepth(): Promise<void> {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ status: string; count: bigint }>
      >`SELECT status, count(*)::int AS count FROM accounting_events GROUP BY status`;
      const byStatus = new Map(rows.map((r) => [r.status, Number(r.count)]));
      for (const status of ['PENDING', 'FAILED', 'POSTED']) {
        this.metrics.accountingQueueDepth.set(
          { status },
          byStatus.get(status) ?? 0,
        );
      }
    } catch {
      // المراقبة لا توقف العامل أبداً — تسجيل فقط.
      this.logger.warn('queue depth observation failed');
    }
  }

  async runOnce(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      const claimed = await this.prisma.claimAccountingEvent(this.workerId);
      if (!claimed) {
        await this.observeQueueDepth();
        this.metrics.accountingWorkerLastSuccess.set(Date.now() / 1000);
        this.metrics.accountingWorkerConsecutiveFailures.set(0);
        return false;
      }
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
        this.metrics.accountingEventsProcessedTotal.inc();
      } catch (error) {
        await this.prisma.withTenantContext(claimed.organizationId, () =>
          this.accounting.markEventFailed(user, claimed.id, error),
        );
        this.metrics.accountingEventsFailedTotal.inc();
        this.logger.warn(`Accounting event ${claimed.id} failed`);
      }
      this.metrics.accountingWorkerLastSuccess.set(Date.now() / 1000);
      this.metrics.accountingWorkerConsecutiveFailures.set(0);
      await this.observeQueueDepth();
      return true;
    } catch (error) {
      // فشل الدورة نفسها (DB غير متاح، فشل claim) — العداد الذي
      // يستعمله alert rule: consecutive_failures > 0 خلال 10m.
      this.metrics.accountingWorkerConsecutiveFailures.inc();
      this.logger.error(
        `Accounting worker cycle failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    } finally {
      this.running = false;
    }
  }
}
