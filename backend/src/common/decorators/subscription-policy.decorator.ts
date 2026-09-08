import { SetMetadata } from '@nestjs/common';

/**
 * سياسة اشتراك المسار — آلية مركزية واحدة لعزل SaaS (Phase 1).
 *
 * الوضعان:
 *  • 'full'  (الافتراضي): المسار محمي — يُرفض بـ 402 SUBSCRIPTION_REQUIRED
 *    عندما تكون حالة اشتراك المنظمة EXPIRED أو CANCELLED.
 *  • 'exempt': المسار متاح دائماً (قراءة، خدمة ما بِيع، إدارة تشغيلية).
 *
 * ⚠️ Fail-closed بالتصميم: أي endpoint كتابة بلا وسم = 'full' —
 * أي مسار مالي مستقبلي جديد محمي تلقائياً دون تكوين.
 *
 * قواعد الاستخدام (تفرضها subscription-policy.spec.ts):
 *  1) الوضع 'exempt' يتطلب reason غير فارغ موثق لكل استثناء —
 *     الاستثناء صريح، ضيق النطاق، قابل للمراجعة والاختبار.
 *  2) يمنع منعاً باتاً وسم مسار "إنشاء التزام مالي جديد" بـ exempt
 *     (بيع/حجز/تقيد/موافقة مصروف/ترحيل محاسبي) — الاختبار الثابت
 *     يفشل البناء عند مخالفة ذلك.
 *  3) أولوية مستوى الطريقة تغلب مستوى الصنف (مثال: bookings.cancel
 *     exempt داخل صنف bookings المحمي).
 */
export type SubscriptionPolicyMode = 'full' | 'exempt';

export interface SubscriptionPolicyOptions {
  mode: SubscriptionPolicyMode;
  /**
   * سبب الاستثناء — إلزامي عند mode='exempt' (اختبار static يفشل
   * بدونه). لا يُستخدم عند 'full'.
   */
  reason?: string;
}

export const SUBSCRIPTION_POLICY_KEY = 'subscriptionPolicy';

export const SubscriptionPolicy = (
  options: SubscriptionPolicyOptions,
): MethodDecorator & ClassDecorator =>
  SetMetadata(SUBSCRIPTION_POLICY_KEY, options);

/**
 * الوسم الافتراضي للمسارات المحمية — صريح للمقروئية فقط؛
 * الغيابه يعادل نفس السلوك تماماً (fail-closed).
 */
export const SubscriptionProtected = (): MethodDecorator & ClassDecorator =>
  SubscriptionPolicy({ mode: 'full' });
