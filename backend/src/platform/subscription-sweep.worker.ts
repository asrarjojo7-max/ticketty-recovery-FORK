import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * سحّال نضج الاشتراكات — نفس مستوى الموثوقية المُجرّب في
 * AccountingEventWorker (نمط متطابق: OnModuleInit/setInterval/
 * unref + قفل إعادة الدخول + تشغيل عند الإقلاع).
 *
 * • كل 6 ساعات افتراضياً (SUBSCRIPTION_SWEEP_INTERVAL_MS).
 * • idempotent: القاعدة صرفة (currentPeriodEnd < now()) —
 *   التكرار no-op ولا يكرر أحداث النظام (dedup داخل الدالة).
 * • آمن مع التجديد المتزامن: platform_renew_subscription يمسك
 *   الصف FOR UPDATE والسحب UPDATE — قفل الصف يسلسلهما؛ أي
 *   ترتيب ينتهي متسقاً (ACTIVE بنهاية مستقبلية).
 * • failure-aware: الخطأ يُسجَّل ويُعاد المحاولة الدورية التالية
 *   (المعاملة ذرية — لا side effects جزئية).
 * • معطّل افتراضياً في dev (متسق مع ACCOUNTING_WORKER_ENABLED)
 *   — الإنتاج يفعّله عبر البيئة. الاختبارات تستدعي الدالة
 *   مباشرة للتحكم بالزمن (لا تعتمد على المؤقت إطلاقاً).
 */
@Injectable()
export class SubscriptionSweepWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionSweepWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('SUBSCRIPTION_SWEEP_ENABLED') !== 'true') {
      return;
    }
    const configured = Number(
      this.config.get<string>('SUBSCRIPTION_SWEEP_INTERVAL_MS') ?? '21600000',
    );
    const interval =
      Number.isInteger(configured) && configured >= 1000
        ? configured
        : 21_600_000; // 6 ساعات
    this.timer = setInterval(() => void this.runOnce(), interval);
    this.timer.unref();
    void this.runOnce();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const expired = await this.prisma.runSubscriptionSweep();
      if (expired > 0) {
        this.logger.log(
          `Subscription sweep matured ${expired} subscription state transition(s)`,
        );
      }
      return expired;
    } catch (error) {
      // المعاملة ذرية — لا أثر جزئي؛ المحاولة القادمة كافية.
      this.logger.warn(
        `Subscription sweep failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return -1;
    } finally {
      this.running = false;
    }
  }
}
