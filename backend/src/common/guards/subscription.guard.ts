import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  AuthenticatedRequest,
  AuthUser,
} from '../decorators/current-user.decorator';
import {
  SUBSCRIPTION_POLICY_KEY,
  SubscriptionPolicyOptions,
} from '../decorators/subscription-policy.decorator';
import { PLATFORM_SCOPE_KEY } from '../decorators/platform-scope.decorator';

/**
 * حالات الاشتراك المسموح بها للعمليات المالية الكاملة:
 * TRIALING/ACTIVE — فترة سارية، PAST_DUE — مهلة سماح 7 أيام
 * (وصول كامل أثناءها، تطبقها expire_subscriptions_sweep).
 * EXPIRED/CANCELLED تمنع "صنع المال الجديد" فقط.
 * subscriptionStatus === null (لا صف اشتراك إطلاقاً) = سماح —
 * نافذة pre-provisioning المقصودة (ثوانٍ بين تزويد المنظمة
 * وضبط المشغّل التجربة)، وتشمل منظمة المشغّل نفسها. موثقة في
 * PRE-LAUNCH_HARDENING_PLAN.md §1.5 ومختبرة في e2e.
 */
const BLOCKED_SUBSCRIPTION_STATUSES = new Set(['EXPIRED', 'CANCELLED']);

/**
 * بوابة اشتراك SaaS — الحلقة الأخيرة في السلسلة العالمية:
 * Throttler → Jwt → Permissions → Subscription (هذه) → TenantRls.
 *
 * مصدر الحقيقة: نفس قراءة DB لكل طلب (auth_user_by_id v3 عبر
 * JwtAuthGuard) — لا توكِن ولا header ولا client state. لا توجد
 * أي قراءة إضافية هنا إطلاقاً.
 *
 * التخطي المشروع فقط: مسارات @Public (لا يوجد مستخدم أصلاً)،
 * مسارات @PlatformScope (خارج سياق أي tenant — مشغّل المنصة يدير
 * اشتراكات المنظمات المنتهية ويجددونها)، وغياب الحالة (null).
 *
 * فشل مركزي موحد: 402 SUBSCRIPTION_REQUIRED — يستخدم فقط عندما
 * تكون حالة الاشتراك تحديداً هي ما يمنع العملية؛ 401 للمصادقة
 * و403 للصلاحيات تبقى كما هي ولا يلمسها هذا الـ guard أبداً.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPlatformScope = this.reflector.getAllAndOverride<boolean>(
      PLATFORM_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPlatformScope) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user: AuthUser | undefined = request.user;
    // @Public paths reach here with no authenticated user — JwtAuthGuard
    // already owns unauthenticated rejection; subscription state is moot.
    if (!user) return true;

    // غياب الحالة = نافذة pre-provisioning / منظمة المشغّل — مذكورة أعلاه.
    const status = user.subscriptionStatus ?? null;
    if (status === null) return true;
    if (!BLOCKED_SUBSCRIPTION_STATUSES.has(status)) return true;

    const policy = this.reflector.getAllAndOverride<
      SubscriptionPolicyOptions | undefined
    >(SUBSCRIPTION_POLICY_KEY, [context.getHandler(), context.getClass()]);

    // Fail-closed: بلا وسم = 'full' — المسارات المالية الجديدة
    // محمية تلقائياً. الوضع الوحيد المسموح عند الانتهاء هو exempt
    // موثق السبب (يفرضه الاختبار الثابت).
    const mode = policy?.mode ?? 'full';
    if (mode === 'exempt') return true;

    throw new HttpException(
      {
        statusCode: 402,
        message:
          'انتهى اشتراك هذه الشركة — يرجى التجديد لمتابعة العمليات الجديدة',
        errorCode: 'SUBSCRIPTION_REQUIRED',
      },
      402,
    );
  }
}
