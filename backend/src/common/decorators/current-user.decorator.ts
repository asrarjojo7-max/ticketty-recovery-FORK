import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  sub: string;
  orgId: string | null;
  branchId: string | null;
  name: string;
  email: string;
  roleKey: string;
  permissions: string[];
  /**
   * حالة اشتراك المنظمة من قراءة DB لكل طلب (auth_user_by_id v3):
   * TRIALING | ACTIVE | PAST_DUE (مهلة سماح 7 أيام) | EXPIRED |
   * CANCELLED — أو null عندما لا يوجد صف اشتراك إطلاقاً (نافذة
   * pre-provisioning أو منظمة مشغّل المنصة). الاستهلاك الوحيد:
   * SubscriptionGuard و/auth/me — لا يوضع في التوكِن أبداً.
   */
  subscriptionStatus?: string | null;
  subscriptionPeriodEnd?: Date | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
